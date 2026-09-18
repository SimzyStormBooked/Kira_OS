import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getWorkspaceConfig } from "@/lib/config";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { WorkspaceAccessError } from "@/lib/auth/errors";
import { assertSameOrigin } from "@/lib/auth/security";
import { verifyWorkspaceAccess } from "@/lib/auth/session";

const inputSchema = z.object({ token_hash: z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/) }).strict();
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
const invalidLink = "This sign-in link has expired or has already been used. Ask your workspace owner for a new link.";
const unavailable = "We could not open your private workspace. Please try again or ask your workspace owner for a new link.";
const consumedLink = "Your sign-in link was used, but we could not finish checking workspace access. Ask your workspace owner for a fresh link, or sign in with your email and password.";
type WorkspaceClient = Awaited<ReturnType<typeof createWorkspaceSupabaseClient>>;

/** Clear browser credentials even if Auth cannot revoke the local refresh token. */
async function clearSession(supabase: WorkspaceClient, supabaseUrl: string) {
  try { await supabase.auth.signOut({ scope: "local" }); } catch { /* Cookie removal still runs. */ }
  const cookieStore = await cookies();
  const prefix = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const names = new Set([prefix, ...cookieStore.getAll().map(cookie => cookie.name)
    .filter(name => name.startsWith(`${prefix}.`) && /^\d+$/.test(name.slice(prefix.length + 1)))]);
  for (const name of names) cookieStore.set(name, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0,
  });
}

/** Link previews and scanners must never consume the one-time token. */
export function GET() {
  return NextResponse.json({ error: "Open the welcome page and choose Enter your workspace to continue." }, { status: 405, headers: { ...headers, Allow: "POST" } });
}

export async function POST(request: Request) {
  let supabase: WorkspaceClient | null = null;
  let supabaseUrl: string | null = null;
  let verificationStarted = false;
  let linkConsumed = false;
  try {
    assertSameOrigin(request);
    const config = getWorkspaceConfig();
    if (config.mode !== "connected" || !config.configured || !config.authorId || !config.supabaseUrl) {
      return NextResponse.json({ error: unavailable }, { status: 503, headers });
    }
    supabaseUrl = config.supabaseUrl;
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Open the welcome page to continue." }, { status: 415, headers });
    }
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: invalidLink }, { status: 400, headers });
    let body = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return NextResponse.json({ error: "The sign-in request is too large." }, { status: 413, headers });
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    let input: z.infer<typeof inputSchema>;
    try { input = inputSchema.parse(JSON.parse(body)); }
    catch { return NextResponse.json({ error: invalidLink }, { status: 400, headers }); }

    supabase = await createWorkspaceSupabaseClient({ writableCookies: true });
    verificationStarted = true;
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: input.token_hash, type: "magiclink" });
    if (error) {
      const status = error.status === 429 ? 429 : error.status && error.status >= 500 ? 503 : 401;
      return NextResponse.json({ error: status === 429 ? "Too many attempts. Please wait before trying again." : status === 503 ? unavailable : invalidLink }, { status, headers });
    }
    if (!data.session || !data.user || data.user.is_anonymous) {
      await clearSession(supabase, config.supabaseUrl);
      return NextResponse.json({ error: invalidLink }, { status: 401, headers });
    }
    linkConsumed = true;
    const access = await verifyWorkspaceAccess(supabase, config.authorId);
    if (access.authorization !== "authorized" || access.user?.id !== data.user.id) {
      await clearSession(supabase, config.supabaseUrl);
      return NextResponse.json(access.authorization === "unavailable"
        ? { error: consumedLink, code: "link_consumed" }
        : { error: "This sign-in link cannot open this workspace. Ask your workspace owner for help." },
        { status: access.authorization === "unavailable" ? 503 : 403, headers });
    }
    return NextResponse.json({ redirectTo: "/" }, { headers });
  } catch (error) {
    if (verificationStarted && supabase && supabaseUrl) {
      try { await clearSession(supabase, supabaseUrl); } catch { /* Never expose provider or cookie details. */ }
    }
    if (linkConsumed && (!(error instanceof WorkspaceAccessError) || error.status === 503)) {
      return NextResponse.json({ error: consumedLink, code: "link_consumed" }, { status: 503, headers });
    }
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    return NextResponse.json({ error: unavailable }, { status: 503, headers });
  }
}
