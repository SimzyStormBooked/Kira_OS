import { WorkspaceAccessError } from "./errors";
import { parseApplicationOrigin } from "@/lib/config";

/** Allow only local application pages, never auth endpoints or protocol-relative URLs. */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") ||
    value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://kira.invalid");
    const pathname = decodeURIComponent(url.pathname);
    if (url.origin !== "https://kira.invalid" || pathname.startsWith("//") ||
      /^\/(?:auth|api|login)(?:\/|$)/.test(pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Prefer the configured public origin; Next normalizes loopback Request URLs to localhost. */
export function expectedRequestOrigin(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (env.NEXT_PUBLIC_APP_URL !== undefined) {
    const configured = parseApplicationOrigin(env.NEXT_PUBLIC_APP_URL);
    if (!configured) throw new WorkspaceAccessError(503, "unconfigured", "The workspace application URL is not configured correctly.");
    return configured;
  }
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (host) {
    // Use the browser's actual target Host, never a caller-supplied forwarded host.
    // This preserves 127.0.0.1 when NextRequest.url has normalized it to localhost.
    if (!/^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::\d+)?$/i.test(host)) {
      throw new WorkspaceAccessError(403, "cross_origin", "This request must come from your KIRA OS workspace.");
    }
    try {
      const hostUrl = new URL(`${target.protocol}//${host}`);
      if (hostUrl.host.toLowerCase() !== host.toLowerCase()) throw new Error("Noncanonical host");
      return hostUrl.origin;
    } catch {
      throw new WorkspaceAccessError(403, "cross_origin", "This request must come from your KIRA OS workspace.");
    }
  }
  return target.origin;
}

/** Browser mutations must originate at this deployment, including login and logout. */
export function assertSameOrigin(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin === "null" || fetchSite === "cross-site" || origin !== expectedRequestOrigin(request, env)) {
    throw new WorkspaceAccessError(403, "cross_origin", "This request must come from your KIRA OS workspace.");
  }
}
