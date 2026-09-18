import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { connectionInputSchema } from "@/lib/connections/schema";
import { createConnectionRepository, ConnectionRepositoryError } from "@/lib/connections/repository";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check the label and full HTTPS profile or notebook link." }, { status: 400, headers });
  if (error instanceof ConnectionRepositoryError && error.code === "23505") return NextResponse.json({ error: "That link is already saved." }, { status: 409, headers });
  if (error instanceof ConnectionRepositoryError && error.code === "42501") return NextResponse.json({ error: "An owner or editor can change saved links." }, { status: 403, headers });
  if (error instanceof ConnectionRepositoryError && error.code === "P0002") return NextResponse.json({ error: "This link is unavailable or you do not have permission to remove it." }, { status: 404, headers });
  return NextResponse.json({ error: "Saved links are unavailable. Please try again." }, { status: 503, headers });
}
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Body required");
  const decoder = new TextDecoder();
  let raw = "", size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new SyntaxError("Body too large"); }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(raw + decoder.decode()) as unknown;
}
export async function GET() {
  try {
    const session = await requireWorkspaceSession();
    return NextResponse.json({ links: await createConnectionRepository(session.supabase, session.authorId).load() }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    const input = connectionInputSchema.parse(await readBody(request));
    return NextResponse.json({ links: await createConnectionRepository(session.supabase, session.authorId).add(input) }, { status: 201, headers });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    const { id } = z.object({ id: z.uuid() }).strict().parse(await readBody(request));
    return NextResponse.json({ links: await createConnectionRepository(session.supabase, session.authorId).remove(id) }, { headers });
  } catch (error) { return failure(error); }
}
