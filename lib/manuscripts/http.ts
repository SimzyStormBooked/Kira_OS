import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { WorkspaceAccessError, requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { assertSameOrigin } from "@/lib/auth/security";

export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export class ManuscriptError extends Error {
  constructor(public readonly code: string, public readonly status = 503, message = "Your book library is unavailable. Please try again.") { super(message); }
}
export function libraryFailure(error: unknown) {
  if (error instanceof WorkspaceAccessError || error instanceof ManuscriptError)
    return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  if (error instanceof ZodError || error instanceof SyntaxError)
    return NextResponse.json({ error: "Check the submitted fields and try again." }, { status: 400, headers: privateHeaders });
  return NextResponse.json({ error: "Your book library could not complete that request. Your saved work is still here." }, { status: 503, headers: privateHeaders });
}
export async function requireLibraryEditor(request: Request) {
  assertSameOrigin(request);
  const session = await requireWorkspaceSession();
  if (await getWorkspaceRole(session) === "viewer") throw new WorkspaceAccessError(403, "forbidden", "An owner or editor can add books and manuscripts. You can read the library.");
  return session;
}
export async function boundedBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > limit) throw new ManuscriptError("too_large", 413, "This upload is too large. Choose a manuscript under 4 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("A request body is required.");
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ManuscriptError("too_large", 413, "This request is too large. Reduce its size and try again."); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
export async function libraryJson(request: Request) {
  return JSON.parse(new TextDecoder().decode(await boundedBody(request, 32768))) as unknown;
}
