import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_AUTHOR_ID = "10000000-0000-4000-8000-000000000001";
export const CONNECTION_KEYS = [
  "KIRA_WORKSPACE_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "KIRA_AUTHOR_ID",
  "NEXT_PUBLIC_APP_URL",
];

// Only the small connection configuration is interpreted. Unrelated values are
// never reported, and the configurator preserves their original text verbatim.
export function connectionEnvLines(content) {
  let openQuote;
  return content.split(/\r?\n/).map((line) => {
    if (openQuote) {
      if (line.includes(openQuote)) openQuote = undefined;
      return { line, name: undefined, raw: undefined };
    }
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) return { line, name: undefined, raw: undefined };
    const raw = match[2].trim();
    if (["\"", "'", "`"].includes(raw[0]) && raw.indexOf(raw[0], 1) === -1) openQuote = raw[0];
    return { line, name: match[1], raw };
  });
}

export function parseConnectionEnv(content) {
  const values = {};
  for (const entry of connectionEnvLines(content)) {
    if (!CONNECTION_KEYS.includes(entry.name)) continue;
    let value = entry.raw;
    if (["\"", "'", "`"].includes(value[0])) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end === -1 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) {
        throw new Error(`Use a single-line value for ${entry.name}.`);
      }
      value = value.slice(1, end);
    } else {
      value = value.split("#", 1)[0].trim();
    }
    values[entry.name] = value;
  }
  return values;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? "");
}

export function isAppOrigin(value, httpsOnly = false) {
  try {
    const url = new URL(value);
    const allowedProtocol = url.protocol === "https:" ||
      (!httpsOnly && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    return allowedProtocol && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function isPublicSupabaseKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(value ?? "")) return true;
  // Older projects can use their anon JWT. A service-role JWT must never enter
  // a NEXT_PUBLIC variable, even though it is syntactically also a JWT.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value ?? "")) return false;
  try {
    const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
    return payload.role === "anon";
  } catch {
    return false;
  }
}

export function inspectSetup(env) {
  const mode = env.KIRA_WORKSPACE_MODE || "demo";
  const missing = [];
  const invalid = [];
  if (!["demo", "connected"].includes(mode)) {
    invalid.push("KIRA_WORKSPACE_MODE must be demo or connected.");
  }
  if (mode === "connected") {
    for (const name of CONNECTION_KEYS.slice(1)) {
      if (!env[name]?.trim()) missing.push(name);
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && !isAppOrigin(env.NEXT_PUBLIC_SUPABASE_URL, true)) {
      invalid.push("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS project origin without a path, credentials, or query.");
    }
    if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !isPublicSupabaseKey(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
      invalid.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon key; privileged keys are not allowed.");
    }
    if (env.KIRA_AUTHOR_ID && !isUuid(env.KIRA_AUTHOR_ID)) {
      invalid.push("KIRA_AUTHOR_ID must be a valid UUID.");
    }
    if (env.NEXT_PUBLIC_APP_URL && !isAppOrigin(env.NEXT_PUBLIC_APP_URL)) {
      invalid.push("NEXT_PUBLIC_APP_URL must be an HTTPS origin, or HTTP localhost for local development.");
    }
  }
  return { mode, missing, invalid, configurationComplete: mode === "connected" && missing.length === 0 && invalid.length === 0 };
}

export function formatSetupReport(result) {
  if (result.mode === "demo") {
    return [
      "KIRA OS is configured for demo mode.",
      "Decisions stay in this browser. Supabase settings alone do not enable a connected workspace.",
      "To connect Cassie's workspace: npm run setup:local",
      "The three-stage handoff is in SETUP.md.",
    ].join("\n");
  }
  const lines = [result.configurationComplete
    ? "Connected configuration is complete. Cloud setup has not been verified."
    : "Connected configuration is incomplete or invalid. The workspace is not ready."];
  for (const name of result.missing) lines.push(`Missing: ${name}`);
  for (const issue of result.invalid) lines.push(`Fix: ${issue}`);
  lines.push(
    "",
    "Still verify in your dedicated Supabase project:",
    "[ ] All repository migrations have been applied.",
    "[ ] supabase/bootstrap.sql has loaded the verified catalog.",
    "[ ] Cassie's existing Auth user is assigned as the author owner.",
    "[ ] Email/password sign-in and a save/reload work in the deployed app.",
    "",
    "This check is local only: it makes no network calls and cannot verify migrations, ownership, or credentials.",
    "See SETUP.md for the short launch path.",
  );
  return lines.join("\n");
}

export async function loadConnectionEnv(directory = process.cwd(), inherited = process.env) {
  const values = {};
  // Match the ordinary local setup's priority: environment > .env.local > .env.
  for (const filename of [".env", ".env.local"]) {
    try {
      Object.assign(values, parseConnectionEnv(await readFile(path.join(directory, filename), "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const name of CONNECTION_KEYS) {
    if (inherited[name] !== undefined) values[name] = inherited[name];
  }
  return values;
}

export async function main() {
  try {
    const result = inspectSetup(await loadConnectionEnv());
    console.log(formatSetupReport(result));
    if (result.invalid.length || result.missing.length) process.exitCode = 1;
  } catch {
    console.error("Could not read the local connection configuration. Check .env and .env.local permissions and single-line connection values. No values have been printed.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
