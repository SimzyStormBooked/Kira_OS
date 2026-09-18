import { NextResponse } from "next/server";
import { getWorkspaceConfig } from "@/lib/config";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { WorkspaceAccessError } from "@/lib/auth/errors";
import { assertSameOrigin } from "@/lib/auth/security";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  try {
    assertSameOrigin(request);
    const config = getWorkspaceConfig();
    if (config.mode === "connected") {
      const supabase = await createWorkspaceSupabaseClient({ writableCookies: true });
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) return NextResponse.json({ error: "We could not sign you out. Please try again." }, { status: 503, headers });
    }
    // A relative destination preserves the browser's public origin behind proxies and on loopback.
    return new NextResponse(null, { status: 303, headers: { ...headers, Location: "/login" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorkspaceAccessError ? error.message : "We could not sign you out. Please try again." },
      { status: error instanceof WorkspaceAccessError ? error.status : 503, headers });
  }
}
