import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { getWorkspaceRole, readWorkspaceAccess, WorkspaceAccessOperationError } from "@/lib/auth/workspace-role";

const role = z.enum(["editor", "viewer"]);
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), email: z.string().trim().toLowerCase().max(254).pipe(z.email()), role }).strict(),
  z.object({ action: z.literal("change"), id: z.uuid(), role, version: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("revoke"), id: z.uuid(), version: z.number().int().nonnegative() }).strict(),
]);
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check the access request and try again." }, { status: 400, headers });
  if (error instanceof WorkspaceAccessOperationError) {
    const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 503;
    const message = status === 403 ? "Only the workspace owner can manage access."
      : status === 409 ? "Access changed. Refresh the list before trying again."
      : status === 404 ? "Access could not be updated. Check that the existing account is confirmed and try again."
      : status === 400 ? "Check the access request and try again."
      : "Workspace access is unavailable. Please try again.";
    return NextResponse.json({ error: message }, { status, headers });
  }
  return NextResponse.json({ error: "Workspace access is unavailable. Please try again." }, { status: 503, headers });
}
export async function GET() {
  try { return NextResponse.json(await readWorkspaceAccess(await requireWorkspaceSession()), { headers }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    if (await getWorkspaceRole(session) !== "owner") throw new WorkspaceAccessOperationError("42501");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Send an application/json request." }, { status: 415, headers });
    }
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "An access request is required." }, { status: 400, headers });
    const decoder = new TextDecoder();
    let raw = "", size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return NextResponse.json({ error: "This access request is too large." }, { status: 413, headers });
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    const input = command.parse(JSON.parse(raw + decoder.decode()));
    const { error } = input.action === "grant"
      ? await session.supabase.rpc("workspace_access_grant", { p_author_id: session.authorId, p_email: input.email, p_role: input.role })
      : input.action === "change"
        ? await session.supabase.rpc("workspace_access_change", { p_author_id: session.authorId, p_member_id: input.id, p_role: input.role, p_expected_version: input.version })
        : await session.supabase.rpc("workspace_access_revoke", { p_author_id: session.authorId, p_member_id: input.id, p_expected_version: input.version });
    if (error) throw new WorkspaceAccessOperationError(error.code ?? "unavailable");
    return NextResponse.json(await readWorkspaceAccess(session), { headers });
  } catch (error) { return failure(error); }
}
