import { link, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { CONNECTION_KEYS, DEFAULT_AUTHOR_ID, connectionEnvLines, inspectSetup, parseConnectionEnv } from "./setup-check.mjs";

export function renderConnectionEnv(original, values) {
  // Validate before interpolating, so pasted line breaks cannot inject settings.
  const result = inspectSetup(values);
  if (!result.configurationComplete || CONNECTION_KEYS.some((name) => /[\r\n]/.test(values[name] ?? ""))) {
    throw new Error("Connection settings are incomplete or invalid. Run npm run setup:check for the required variable names.");
  }
  parseConnectionEnv(original);
  const kept = connectionEnvLines(original)
    .filter((entry) => !CONNECTION_KEYS.includes(entry.name))
    .map((entry) => entry.line).join("\n").trimEnd();
  const block = CONNECTION_KEYS.map((name) => `${name}=${values[name]}`).join("\n");
  return `${kept ? `${kept}\n\n` : ""}${block}\n`;
}

export async function writeConnectionEnv(directory, values, { replace = false } = {}) {
  const target = path.join(directory, ".env.local");
  let original = "";
  let existing;
  try {
    existing = await lstat(target);
    if (!existing.isFile() || existing.nlink !== 1) {
      throw new Error(".env.local must be a regular file with no symbolic or hard links.");
    }
    if (!replace) throw new Error(".env.local already exists. Use --replace to update connection settings while preserving unrelated entries.");
    original = await readFile(target, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const content = renderConnectionEnv(original, values);
  const temporary = path.join(directory, `.env.local.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (existing) {
      const current = await lstat(target);
      if (!current.isFile() || current.ino !== existing.ino || current.mtimeMs !== existing.mtimeMs || current.size !== existing.size) {
        throw new Error(".env.local changed during setup. No update was made; run setup again.");
      }
      await rename(temporary, target);
    } else {
      // Unlike rename, link fails rather than overwriting a file created while
      // setup was running. The final inode already has private permissions.
      await link(temporary, target);
    }
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

async function ask(prompt, { hidden = false } = {}) {
  let muted = false;
  const output = hidden ? new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  }) : process.stdout;
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  return await new Promise((resolve, reject) => {
    let answered = false;
    reader.on("SIGINT", () => {
      reader.close();
      reject(new Error("Setup cancelled. No connection settings were written."));
    });
    reader.on("close", () => {
      if (!answered) reject(new Error("Setup cancelled. No connection settings were written."));
    });
    reader.question(prompt, (answer) => {
      answered = true;
      muted = false;
      if (hidden) process.stdout.write("\n");
      reader.close();
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

async function collectValues(fromEnv) {
  if (fromEnv) {
    let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
    if (process.env.SUPABASE_PUBLISHABLE_KEY_FILE) {
      key = (await readFile(process.env.SUPABASE_PUBLISHABLE_KEY_FILE, "utf8")).trim();
    }
    return {
      KIRA_WORKSPACE_MODE: "connected",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      KIRA_AUTHOR_ID: process.env.KIRA_AUTHOR_ID || DEFAULT_AUTHOR_ID,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    };
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Open a terminal for the interactive setup, or use --from-env with the documented environment variables.");
  }
  console.log("Let's connect Cassie's KIRA OS workspace. This writes a private .env.local file only.");
  const url = await ask("Supabase project URL (https://…): ");
  const key = await ask("Supabase publishable key (hidden): ", { hidden: true });
  const author = await ask(`Author ID [${DEFAULT_AUTHOR_ID}]: `);
  const app = await ask("App URL [http://localhost:3000]: ");
  return {
    KIRA_WORKSPACE_MODE: "connected",
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    KIRA_AUTHOR_ID: author || DEFAULT_AUTHOR_ID,
    NEXT_PUBLIC_APP_URL: app || "http://localhost:3000",
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) {
    console.log("Usage: npm run setup:local -- [--replace] [--from-env]\n\nInteractive key entry is hidden. --replace is required if .env.local exists.\n--from-env reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\n(or SUPABASE_PUBLISHABLE_KEY_FILE), plus optional KIRA_AUTHOR_ID and NEXT_PUBLIC_APP_URL.\nKeys are never accepted as command-line arguments. See SETUP.md.");
    return;
  }
  try {
    if (args.some((arg) => !["--replace", "--from-env"].includes(arg))) {
      throw new Error("Unknown option. Use --help for the supported setup options.");
    }
    const values = await collectValues(args.includes("--from-env"));
    const result = inspectSetup(values);
    if (!result.configurationComplete) {
      for (const name of result.missing) console.error(`Missing: ${name}`);
      for (const issue of result.invalid) console.error(`Fix: ${issue}`);
      process.exitCode = 1;
      return;
    }
    await writeConnectionEnv(process.cwd(), values, { replace: args.includes("--replace") });
    console.log("Saved .env.local with private file permissions. No keys were printed.\nNext: npm run setup:check\nCloud migrations and the author owner still need verification; see SETUP.md.");
  } catch (error) {
    // OS errors can include caller-supplied paths. Only our controlled messages
    // are safe to print; never echo input values, environment data, or stacks.
    console.error(error.code ? "Setup could not read or save the configuration. Check file permissions and any key-file path; no values were printed." : error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
