export type WorkspaceMode = "demo" | "connected";

export interface WorkspaceConfig {
  mode: WorkspaceMode;
  configured: boolean;
  authorId: string | null;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  errors: string[];
}

/** Pure configuration validation. Never pass this whole object to a client component. */
export function getWorkspaceConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WorkspaceConfig {
  const modeValue = env.KIRA_WORKSPACE_MODE ?? "demo";
  if (modeValue === "demo") {
    return {
      mode: "demo", configured: true, authorId: null,
      supabaseUrl: null, supabasePublishableKey: null, errors: [],
    };
  }

  const errors: string[] = [];
  if (modeValue !== "connected") {
    errors.push("KIRA_WORKSPACE_MODE must be demo or connected.");
  }
  if (env.NEXT_PUBLIC_APP_URL !== undefined && !parseApplicationOrigin(env.NEXT_PUBLIC_APP_URL)) {
    errors.push("NEXT_PUBLIC_APP_URL must be an HTTPS origin, or HTTP localhost for local development.");
  }
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let supabaseUrl: string | null = null;
  try {
    const url = new URL(rawUrl ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Invalid project URL");
    }
    supabaseUrl = url.origin;
  } catch {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS project URL (HTTP is allowed for localhost).");
  }

  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  let supabasePublishableKey: string | null = null;
  if (key && isPublishableKey(key)) {
    supabasePublishableKey = key;
  } else {
    errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key, never a secret or service-role key.");
  }
  const authorId = env.KIRA_AUTHOR_ID?.trim() ?? null;
  if (!authorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorId)) {
    errors.push("KIRA_AUTHOR_ID must be the UUID of the private author workspace.");
  }
  return {
    mode: "connected", configured: errors.length === 0,
    authorId: errors.length === 0 ? authorId : null,
    supabaseUrl, supabasePublishableKey, errors,
  };
}

/**
 * The address an owner shares with a collaborator: the configured public URL when
 * set, otherwise this deployment's own host. Never a caller-supplied forwarded host.
 */
export function resolveShareOrigin(
  host: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  if (env.NEXT_PUBLIC_APP_URL !== undefined) return parseApplicationOrigin(env.NEXT_PUBLIC_APP_URL);
  if (!host || !/^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::\d+)?$/i.test(host)) return null;
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  return parseApplicationOrigin(`${local ? "http" : "https"}://${host}`);
}

export function parseApplicationOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isPublishableKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    // Only inspect the API key type here. Authentication verifies user tokens separately.
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "anon" && payload.iss === "supabase";
  } catch {
    return false;
  }
}
