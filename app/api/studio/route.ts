import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { assertSameOrigin } from "@/lib/auth/security";
import { assertStudioPrompt, StudioPolicyError, studioRequestSchema, studioUsage } from "@/lib/ai/studio-contract";
import { getStudioAvailability, StudioProviderError } from "@/lib/ai/studio-provider";
import { runStudioProvider } from "@/lib/ai/provider";
import { createStudioRepository, StudioRepositoryError } from "@/lib/db/studio-repository";

export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
/** Final writes are idempotent; retry their persistence once, never the paid model call. */
async function persistOutcome<T>(write: () => Promise<T>): Promise<T> {
  try { return await write(); }
  catch { return write(); }
}
function failure(error: unknown, requestId: string | null = null) {
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof StudioPolicyError) return NextResponse.json({ error: error.message }, { status: 422, headers });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Check the question and try again." }, { status: 400, headers });
  if (error instanceof StudioRepositoryError) {
    const messages: Record<string, [number, string]> = {
      "42501": [403, "Raven could not authorize this request. Ask your workspace owner to check access and AI setup."], "40001": [409, "This request ID has already been used. Start a new question."],
      "55P03": [409, "Another question is still being considered. Check recent questions in a moment."],
      "54000": [429, "Your workspace has used its 20 questions for today. The limit resets at midnight UTC."],
    };
    const [status, message] = messages[error.code] ?? [503, "Your saved questions are unavailable. Please try again."];
    return NextResponse.json({ error: message, requestId }, { status, headers });
  }
  return NextResponse.json({ error: "Ask Raven is unavailable. No automatic retry will run.", requestId }, { status: 503, headers });
}
async function readRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Body required");
  const decoder = new TextDecoder();
  let raw = "", size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 32768) { await reader.cancel(); return null; }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(raw + decoder.decode()) as unknown;
}
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession();
    const id = new URL(request.url).searchParams.get("id");
    if (id !== null && !z.uuid().safeParse(id).success) return NextResponse.json({ error: "This question link is invalid." }, { status: 400, headers });
    const repo = createStudioRepository(session.supabase, session.authorId);
    const [role, availability, generations, generation] = await Promise.all([
      getWorkspaceRole(session), getStudioAvailability(), repo.list(), id ? repo.find(id) : Promise.resolve(null),
    ]);
    if (id && !generation) return NextResponse.json({ error: "This question is unavailable or belongs to another workspace." }, { status: 404, headers });
    return NextResponse.json({ role, availability, generations, generation }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  let pendingId: string | null = null;
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    if (await getWorkspaceRole(session) === "viewer") throw new WorkspaceAccessError(403, "forbidden", "An owner or editor can ask Raven. You can read saved answers.");
    const body = await readRequest(request);
    if (body === null) return NextResponse.json({ error: "This question is too large." }, { status: 413, headers });
    const parsed = studioRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Choose a job and write a question of 10 to 6,000 characters." }, { status: 400, headers });
    const input = parsed.data;
    assertStudioPrompt(input.prompt);
    const availability = await getStudioAvailability();
    if (!availability.available) return NextResponse.json({ error: availability.message, availability }, { status: 503, headers });
    const repo = createStudioRepository(session.supabase, session.authorId);
    const started = await repo.begin(input);
    if (!started.created) return NextResponse.json({ generation: started.generation }, { status: started.generation.status === "pending" ? 202 : 200, headers });
    pendingId = input.id;
    let reply;
    try { reply = await runStudioProvider(input); }
    catch (error) {
      const code = error instanceof StudioProviderError ? error.code : error instanceof StudioPolicyError ? "policy_blocked" : "provider_unavailable";
      const usage = error instanceof StudioProviderError ? error.usage : studioUsage(undefined, undefined);
      const generation = await persistOutcome(() => repo.fail(input.id, code, usage));
      return NextResponse.json({ generation }, { status: 201, headers });
    }
    // Return an answer only after it is durable; a persistence failure must not trigger another paid call.
    const generation = await persistOutcome(() => repo.complete(input.id, reply));
    return NextResponse.json({ generation }, { status: 201, headers });
  } catch (error) { return failure(error, pendingId); }
}
