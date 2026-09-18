import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { getPasswordSetupEligibility } from "@/lib/auth/password-setup";
import { assertSameOrigin } from "@/lib/auth/security";

const password = z.string().min(12).max(128).refine(value => [...value].length >= 12);
const command = z.object({ newPassword: password, confirmPassword: password }).strict()
  .refine(value => value.newPassword === value.confirmPassword);
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function reply(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    if (!session.user.email) return reply("This account cannot choose a password here.", 403);
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return reply("Submit the password form to continue.", 415);
    }
    const reader = request.body?.getReader();
    if (!reader) return reply("Enter and confirm your new password.", 400);
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
    const writable = await createWorkspaceSupabaseClient({ writableCookies: true });
    // Verify the same caller-scoped client that will perform the password update.
    const eligibility = await getPasswordSetupEligibility({ user: session.user, supabase: writable });
    if (!eligibility.eligible) {
      return reply(eligibility.reason === "unavailable"
        ? "We could not verify your recent sign-in. Please try again."
        : "For your security, open a fresh sign-in link before choosing a password, or use your current password to change it.",
      eligibility.reason === "unavailable" ? 503 : 403);
    }
    const { error } = await writable.auth.updateUser({ password: input.newPassword });
    if (error) {
      const status = error.status === 429 ? 429 : !error.status || error.status >= 500 ? 503 : 400;
      return reply(status === 429 ? "Too many attempts. Wait a moment before trying again."
        : status === 503 ? "Your password could not be updated right now. Please try again."
        : "That password could not be accepted. Choose a different password, or use the current-password form.", status);
    }
    return NextResponse.json({ changed: true }, { headers });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return reply(error.message, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return reply("Use a password of 12–128 characters and make sure both passwords match.", 400);
    }
    return reply("Your password could not be updated right now. Please try again.", 503);
  }
}
