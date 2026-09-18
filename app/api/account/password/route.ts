import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { assertSameOrigin } from "@/lib/auth/security";
import { getWorkspaceConfig } from "@/lib/config";

const newPassword = z.string().min(12).max(128).refine((value) => [...value].length >= 12);
const command = z.object({
  currentPassword: z.string().min(1).max(128), newPassword, confirmPassword: newPassword,
}).strict().refine((value) => value.newPassword === value.confirmPassword)
  .refine((value) => value.currentPassword !== value.newPassword);
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function reply(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    if (!session.user.email) return reply("This account cannot change its password here.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return reply("Submit the password form to continue.", 415);
    }
    const reader = request.body?.getReader();
    if (!reader) return reply("Complete all three password fields.", 400);
    const decoder = new TextDecoder();
    let raw = "", size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) { await reader.cancel(); return reply("This password request is too large.", 413); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    const input = command.parse(JSON.parse(raw + decoder.decode()));
    const config = getWorkspaceConfig();
    if (!config.configured || config.mode !== "connected" || !config.supabaseUrl || !config.supabasePublishableKey) {
      return reply("Account settings are not available yet.", 503);
    }
    // Reauthenticate in request-local memory. A wrong current password must not
    // replace the browser's existing session or modify any account.
    const verifier = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
      email: session.user.email, password: input.currentPassword,
    });
    if (verifyError) {
      if (verifyError.status === 429) return reply("Too many attempts. Wait a moment before trying again.", 429);
      if (!verifyError.status || verifyError.status >= 500) return reply("Password verification is temporarily unavailable. Please try again.", 503);
      return reply("Your current password could not be verified. Please try again.", 401);
    }
    if (!verified.user || verified.user.id !== session.user.id || !verified.session || verified.session.user.id !== session.user.id) {
      return reply("Your current password could not be verified. Please try again.", 401);
    }
    // The same verified account receives a fresh HttpOnly session before update.
    const writable = await createWorkspaceSupabaseClient({ writableCookies: true });
    const { data: installed, error: installError } = await writable.auth.setSession({
      access_token: verified.session.access_token, refresh_token: verified.session.refresh_token,
    });
    if (installError || installed.user?.id !== session.user.id) return reply("Your session could not be renewed. Please sign in again.", 503);
    const { error: updateError } = await writable.auth.updateUser({ password: input.newPassword });
    if (updateError) {
      const status = updateError.status === 429 ? 429 : !updateError.status || updateError.status >= 500 ? 503 : 400;
      return reply(status === 429 ? "Too many attempts. Wait a moment before trying again."
        : status === 503 ? "Your password could not be updated right now. Please try again."
        : "That password could not be accepted. Choose a different password and try again.", status);
    }
    return NextResponse.json({ changed: true }, { headers });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return reply(error.message, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return reply("Use a different password of 12–128 characters and make sure the new passwords match.", 400);
    return reply("Your password could not be updated right now. Please try again.", 503);
  }
}
