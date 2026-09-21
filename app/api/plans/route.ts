import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { assertSameOrigin } from "@/lib/auth/security";
import { libraryJson, ManuscriptError, privateHeaders as headers } from "@/lib/manuscripts/http";
import { createStrategyRepository, StrategyError } from "@/lib/strategy/repository";
import { strategyInputSchema, strategyResultInputSchema } from "@/lib/strategy/contract";
import { assertStudioPrompt, StudioPolicyError, studioUsage } from "@/lib/ai/studio-contract";
import { getStudioAvailability, StudioProviderError } from "@/lib/ai/studio-provider";
import { runStrategyProvider } from "@/lib/ai/provider";
export const maxDuration = 90;
const base = { id: z.uuid(), expected: z.number().int().nonnegative() };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.uuid(), expected: z.number().int().nonnegative().nullable(), input: strategyInputSchema }).strict(),
  z.object({ action: z.literal("generate"), ...base, requestId: z.uuid() }).strict(),
  z.object({ action: z.literal("review"), ...base, decision: z.enum(["approved", "changes_requested"]), feedback: z.string().trim().max(4000) }).strict(),
  z.object({ action: z.literal("activate"), ...base }).strict(),
  z.object({ action: z.literal("task"), ...base, status: z.enum(["todo", "done", "skipped"]) }).strict(),
  z.object({ action: z.literal("result"), id: z.uuid(), result: strategyResultInputSchema }).strict(),
]);
function failure(error: unknown, intent: "read" | "write" = "write") {
  if (error instanceof WorkspaceAccessError || error instanceof ManuscriptError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof StudioPolicyError) return NextResponse.json({ error: error.message }, { status: 422, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check the plan fields and try again." }, { status: 400, headers });
  const messages: Record<string, [number, string]> = { "42501": [403,"Your role or source permissions do not allow this action."], "40001": [409,"This plan changed. Refresh before trying again."], "55P03": [409,"A plan is being generated. Wait a moment, then refresh."], "54000": [429,"Your workspace has used its 20 plan generations for today. They reset at midnight UTC."], "P0002": [404,"This plan is unavailable."], "22023": [400,"Check the plan, review status and dates before trying again."], "23505": [409,"This item already exists. Refresh your saved plans."] };
  const unknownFailure: [number, string] = intent === "read"
    ? [503,"Marketing Plans could not load right now. Your saved work is untouched."]
    : [503,"Marketing Plans could not save this change. Refresh to check your saved work."];
  const [status, message] = error instanceof StrategyError ? messages[error.code] ?? unknownFailure : intent === "read"
    ? [503,"Marketing Plans could not load right now. Your saved work is untouched."]
    : [503,"Marketing Plans is temporarily unavailable. Your saved work is retained."];
  return NextResponse.json({ error: message }, { status, headers });
}
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession(), repo = createStrategyRepository(session.supabase, session.authorId);
    const id = new URL(request.url).searchParams.get("id"); if (id) z.uuid().parse(id);
    const [role, data] = await Promise.all([getWorkspaceRole(session), id ? repo.detail(id) : repo.list()]);
    return NextResponse.json({ role, ...(id ? { detail: data } : { plans: data }) }, { headers });
  } catch (error) { return failure(error, "read"); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    if (await getWorkspaceRole(session) === "viewer") throw new WorkspaceAccessError(403,"forbidden","An owner or editor can change plans. You can read them.");
    const body = actionSchema.parse(await libraryJson(request)), repo = createStrategyRepository(session.supabase, session.authorId);
    switch (body.action) {
      case "save": return NextResponse.json({ plan: await repo.save(body.id, body.expected, body.input) }, { headers });
      case "review": return NextResponse.json({ plan: await repo.review(body.id, body.expected, body.decision, body.feedback) }, { headers });
      case "activate": return NextResponse.json({ plan: await repo.activate(body.id, body.expected) }, { headers });
      case "task": return NextResponse.json({ task: await repo.task(body.id, body.expected, body.status) }, { headers });
      case "result": return NextResponse.json({ result: await repo.result(body.id, body.result) }, { headers });
      case "generate": {
        const detail = await repo.detail(body.id); assertStudioPrompt(detail.plan.input.intent);
        const availability = await getStudioAvailability();
        if (!availability.available) return NextResponse.json({ error: availability.message }, { status: 503, headers });
        const started = await repo.begin(body.id, body.requestId, body.expected);
        if (!started.created) return NextResponse.json({ revision: started.revision }, { status: started.revision.status === "pending" ? 202 : 200, headers });
        let outcome: Parameters<typeof repo.finish>;
        try { const reply = await runStrategyProvider(started.revision.input_snapshot); outcome = [body.requestId, reply.output, null, reply.usage]; }
        catch (error) { outcome = [body.requestId, null, error instanceof StudioProviderError ? error.code : error instanceof StudioPolicyError ? "policy_blocked" : "provider_unavailable", error instanceof StudioProviderError ? error.usage : studioUsage(undefined,undefined)]; }
        // Retry only an idempotent database write, never the paid model call.
        let revision; try { revision = await repo.finish(...outcome); } catch { revision = await repo.finish(...outcome); }
        return NextResponse.json({ revision }, { headers });
      }
    }
  } catch (error) { return failure(error); }
}
