import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_AUTHOR_ID,
  formatSetupReport,
  inspectSetup,
  loadConnectionEnv,
  parseConnectionEnv,
} from "../scripts/setup-check.mjs";
import { renderConnectionEnv, writeConnectionEnv } from "../scripts/configure-local.mjs";

const fakeKey = "sb_publishable_test_only_no_real_credential";
const values = {
  KIRA_WORKSPACE_MODE: "connected",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakeKey,
  KIRA_AUTHOR_ID: DEFAULT_AUTHOR_ID,
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};
const temporaryDirectories: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(tmpdir(), "kira-setup-"));
  temporaryDirectories.push(result);
  return result;
}
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("local setup validation", () => {
  it("keeps absent configuration in demo mode and requires all connected fields", () => {
    expect(inspectSetup({})).toMatchObject({ mode: "demo", configurationComplete: false });
    const result = inspectSetup({ KIRA_WORKSPACE_MODE: "connected" });
    expect(result.missing).toHaveLength(4);
    expect(result.configurationComplete).toBe(false);
    expect(formatSetupReport(result)).toContain("The workspace is not ready");
  });

  it("reports valid configuration without claiming that cloud setup is verified", () => {
    const result = inspectSetup(values);
    expect(result.configurationComplete).toBe(true);
    const report = formatSetupReport(result);
    expect(report).toContain("Cloud setup has not been verified");
    expect(report).toContain("migrations");
    expect(report).toContain("author owner");
    expect(report).not.toContain(fakeKey);
  });

  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: "http://example.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://user:password@example.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co/rest/v1" },
    { KIRA_AUTHOR_ID: "not-a-uuid" },
    { NEXT_PUBLIC_APP_URL: "http://public.example.com" },
    { KIRA_WORKSPACE_MODE: "conected" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_should_never_be_public" },
  ])("rejects invalid or privileged configuration without reflecting its value: %j", (change) => {
    const result = inspectSetup({ ...values, ...change });
    expect(result.configurationComplete).toBe(false);
    expect(result.invalid.length).toBeGreaterThan(0);
    expect(formatSetupReport(result)).not.toContain(Object.values(change)[0]);
  });

  it("accepts a legacy anon JWT and rejects an equally shaped service-role JWT", () => {
    const token = (role: string) => `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.testsignature`;
    expect(inspectSetup({ ...values, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: token("anon") }).configurationComplete).toBe(true);
    expect(inspectSetup({ ...values, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: token("service_role") }).configurationComplete).toBe(false);
  });

  it("reads only known fields with environment precedence", async () => {
    const cwd = await directory();
    await writeFile(path.join(cwd, ".env"), "KIRA_WORKSPACE_MODE=demo\nPRIVATE_KEY=never-return-this\n");
    await writeFile(path.join(cwd, ".env.local"), 'export KIRA_WORKSPACE_MODE="connected" # local setting\n');
    expect(await loadConnectionEnv(cwd, { NODE_ENV: "test" })).toEqual({ KIRA_WORKSPACE_MODE: "connected" });
    expect(await loadConnectionEnv(cwd, { NODE_ENV: "test", KIRA_WORKSPACE_MODE: "demo" })).toEqual({ KIRA_WORKSPACE_MODE: "demo" });
  });
});

describe("private local configuration writer", () => {
  it("preserves unrelated settings, comments, and multiline values while replacing duplicates", () => {
    const original = '# Keep this\nOTHER_KEY="unchanged"\nMULTILINE="start\nKIRA_AUTHOR_ID=literal-content\nend"\nKIRA_AUTHOR_ID=old\nexport KIRA_AUTHOR_ID=duplicate\n';
    const result = renderConnectionEnv(original, values);
    expect(result).toContain('# Keep this\nOTHER_KEY="unchanged"\nMULTILINE="start\nKIRA_AUTHOR_ID=literal-content\nend"');
    expect(result).not.toContain("duplicate");
    expect(parseConnectionEnv(result)).toEqual(values);
  });

  it("rejects injected line breaks before creating any configuration", () => {
    expect(() => renderConnectionEnv("", { ...values, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `${fakeKey}\nINJECTED=1` })).toThrow();
  });

  it("writes mode 0600 and refuses replacement without explicit --replace", async () => {
    const cwd = await directory();
    const target = path.join(cwd, ".env.local");
    await writeConnectionEnv(cwd, values);
    expect((await stat(target)).mode & 0o777).toBe(0o600);
    await expect(writeConnectionEnv(cwd, { ...values, NEXT_PUBLIC_APP_URL: "https://kira.example.com" })).rejects.toThrow(/--replace/);
    expect(parseConnectionEnv(await readFile(target, "utf8"))).toEqual(values);
    await writeFile(target, `${await readFile(target, "utf8")}OTHER_KEY=keep-me\n`);
    await writeConnectionEnv(cwd, { ...values, NEXT_PUBLIC_APP_URL: "https://kira.example.com" }, { replace: true });
    expect(await readFile(target, "utf8")).toContain("OTHER_KEY=keep-me");
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it("refuses symlinks rather than editing another file", async () => {
    const cwd = await directory();
    const other = path.join(cwd, "other");
    await writeFile(other, "untouched");
    await symlink(other, path.join(cwd, ".env.local"));
    await expect(writeConnectionEnv(cwd, values, { replace: true })).rejects.toThrow(/regular file/);
    expect(await readFile(other, "utf8")).toBe("untouched");
  });

  it("can run noninteractively using a key file without printing the key", async () => {
    const cwd = await directory();
    const keyFile = path.join(cwd, "key-input");
    await writeFile(keyFile, fakeKey, { mode: 0o600 });
    const script = fileURLToPath(new URL("../scripts/configure-local.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, "--from-env"], {
      cwd,
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        NEXT_PUBLIC_SUPABASE_URL: values.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY_FILE: keyFile,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Saved .env.local");
    expect(result.stdout + result.stderr).not.toContain(fakeKey);
    expect(parseConnectionEnv(await readFile(path.join(cwd, ".env.local"), "utf8"))).toEqual(values);
  });
});
