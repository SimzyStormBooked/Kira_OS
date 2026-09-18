import "server-only";
import { NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/auth/session";
import { MetaAccessError } from "./meta-repository";
import { MetaProviderError } from "./meta-provider";
export const metaHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export const metaStateCookie = "kira_meta_oauth";
export const metaStateCookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/connections/meta/callback", maxAge: 600 };
export function metaFailure(error: unknown) {
  const code = error instanceof MetaAccessError || error instanceof MetaProviderError ? error.code : "unavailable";
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers: metaHeaders });
  const messages: Record<string, string> = {
    setup_pending: "Meta authorization setup is pending.", owner_required: "Only the workspace owner can manage Meta authorization.",
    reconnect: "Reconnect your Meta account to restore read access.", permissions: "Meta did not grant all the required read permissions. Reconnect after checking the app setup.",
    no_accounts: "Meta returned no accessible Facebook Pages. Check Page access and the linked Instagram professional account.",
    invalid_state: "This authorization attempt expired or was already used. Start again from Connections.",
  };
  return NextResponse.json({ error: messages[code] ?? "Meta could not be reached or verified. Please try again." }, {
    status: code === "owner_required" ? 403 : code === "invalid_state" ? 400 : ["reconnect", "permissions", "no_accounts"].includes(code) ? 409 : 503, headers: metaHeaders,
  });
}
export async function readSmallBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new MetaAccessError("invalid_state");
  const decoder = new TextDecoder(); let raw = "", size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new MetaAccessError("invalid_state"); }
    raw += decoder.decode(part.value, { stream: true });
  }
  return raw + decoder.decode();
}
