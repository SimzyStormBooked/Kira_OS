import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceConfig } from "@/lib/config";

export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-kira-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers } });
  const workspace = getWorkspaceConfig();
  if (workspace.mode === "demo") return response;

  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  if (!workspace.configured || !workspace.supabaseUrl || !workspace.supabasePublishableKey) return response;
  const supabase = createServerClient(workspace.supabaseUrl, workspace.supabasePublishableKey, {
    cookieOptions: {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, cacheHeaders) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        headers.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers } });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", "private, no-store, max-age=0");
      },
    },
  });
  try {
    // Verifies the JWT and refreshes near-expiry tokens. Data access verifies Auth + RLS again.
    await supabase.auth.getClaims();
  } catch {
    // The server authorization boundary will return an unavailable/anonymous state.
  }
  return response;
}

export const config = {
  // Do not skip arbitrary file suffixes: dynamic workspace slugs must always overwrite
  // x-kira-pathname before a layout uses it to select the public sign-in screen.
  matcher: ["/((?!_next/|favicon\\.ico$|icon\\.svg$).*)"],
};
