import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceConfig } from "@/lib/config";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { WorkspaceAccessError } from "@/lib/auth/errors";
import { assertSameOrigin, safeRedirectPath } from "@/lib/auth/security";
import { verifyWorkspaceAccess } from "@/lib/auth/session";

const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
  next: z.string().max(2048).optional(),
});
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const config = getWorkspaceConfig();
    if (config.mode !== "connected" || !config.configured || !config.authorId) {
      return NextResponse.json({ error: "The private workspace connection is not ready yet." }, { status: 503, headers: noStore });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return NextResponse.json({ error: "Submit the sign-in form to continue." }, { status: 415, headers: noStore });
    }
    const body = await request.text();
    if (body.length > 4096) {
      return NextResponse.json({ error: "The sign-in request is too large." }, { status: 413, headers: noStore });
    }
    let parsed: z.infer<typeof credentials>;
    try {
      parsed = credentials.parse(JSON.parse(body));
    } catch {
      return NextResponse.json({ error: "Enter your email and password to continue." }, { status: 400, headers: noStore });
    }
    const supabase = await createWorkspaceSupabaseClient({ writableCookies: true });
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.email, password: parsed.password });
    if (error) {
      const status = error.status === 429 ? 429 : error.status && error.status >= 500 ? 503 : 401;
      const message = status === 429 ? "Too many attempts. Please wait a moment before trying again."
        : status === 503 ? "Sign-in is temporarily unavailable. Please try again."
          : "We could not sign you in. Check your email and password.";
      return NextResponse.json({ error: message }, { status, headers: noStore });
    }
    const access = await verifyWorkspaceAccess(supabase, config.authorId);
    if (access.authorization !== "authorized") {
      await supabase.auth.signOut({ scope: "local" });
      const unavailable = access.authorization === "unavailable";
      return NextResponse.json({ error: unavailable
        ? "We could not verify workspace access. Please try again."
        : "This account does not have access to this workspace. Ask your workspace owner to add you." },
      { status: unavailable ? 503 : 403, headers: noStore });
    }
    return NextResponse.json({ redirectTo: safeRedirectPath(parsed.next) }, { headers: noStore });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    }
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503, headers: noStore });
  }
}
