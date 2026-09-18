import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { approvalSchema, feedbackSchema, recommendationSchema } from "@/types/domain";
import type { ApprovalAction } from "@/lib/agents/approvals";

export const connectedFeedbackSchema = feedbackSchema.extend({
  scope: z.literal("author_workspace"),
  user_id: z.uuid(),
});
export const connectedWorkspaceSchema = z.object({
  version: z.literal(1),
  approvals: z.array(approvalSchema),
  feedback: z.array(connectedFeedbackSchema),
  dismissed: z.array(z.uuid()),
  recommendations: z.array(recommendationSchema),
  last_run_at: z.iso.datetime().nullable(),
});
export type ConnectedWorkspace = z.infer<typeof connectedWorkspaceSchema>;
export type ConnectedFeedback = z.infer<typeof connectedFeedbackSchema>;

export class ConnectedRepositoryError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ConnectedRepositoryError";
  }
}

type DatabaseError = { message: string; code: string };
function checkError(error: DatabaseError | null) {
  if (!error) return;
  if (error.code === "40001")
    throw new ConnectedRepositoryError("This request changed. Reload before reviewing.", error.code);
  if (error.code === "42501")
    throw new ConnectedRepositoryError("You do not have permission to change this workspace.", error.code);
  if (error.code === "P0002")
    throw new ConnectedRepositoryError("This workspace item is unavailable. Reload before trying again.", error.code);
  throw new ConnectedRepositoryError(error.message, error.code);
}

// PostgREST renders timestamptz with +00:00; the domain uses canonical UTC Z.
function canonicalDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalDates);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    ["created_at", "updated_at", "retrieved_at", "last_run_at"].includes(key) && typeof entry === "string"
      ? new Date(entry).toISOString()
      : canonicalDates(entry),
  ]));
}

/** A session-bound client is supplied by the server auth layer. Never use a service-role client. */
export function createConnectedRepository(client: SupabaseClient, authorId: string) {
  z.uuid().parse(authorId);

  async function loadWorkspace(): Promise<ConnectedWorkspace> {
    // Explicit tenant filters are defense in depth; the database applies RLS too.
    const [approvals, feedback, recommendations, runs] = await Promise.all([
      client.from("approval_requests").select("*").eq("author_id", authorId)
        .neq("data_origin", "demo").order("created_at", { ascending: false }),
      client.from("human_feedback").select("*").eq("author_id", authorId)
        .eq("scope", "author_workspace").order("created_at", { ascending: true }),
      client.from("agent_recommendations").select("*").eq("author_id", authorId)
        .neq("data_origin", "demo").order("priority_score", { ascending: false }),
      client.from("agent_runs").select("completed_at,agent_definitions!inner(name)")
        .eq("author_id", authorId).eq("agent_definitions.name", "The Raven")
        .eq("status", "completed").neq("data_origin", "demo")
        .order("completed_at", { ascending: false }).limit(1),
    ]);
    for (const result of [approvals, feedback, recommendations, runs]) checkError(result.error);
    const parsedRecommendations = z.array(recommendationSchema).parse(canonicalDates(recommendations.data ?? []));
    return connectedWorkspaceSchema.parse(canonicalDates({
      version: 1,
      approvals: approvals.data ?? [],
      feedback: feedback.data ?? [],
      recommendations: parsedRecommendations,
      dismissed: parsedRecommendations.filter((r) => r.status === "dismissed").map((r) => r.id),
      last_run_at: runs.data?.[0]?.completed_at ?? null,
    }));
  }

  async function mutate(name: string, args: Record<string, unknown>) {
    const { error } = await client.rpc(name, { ...args, p_author_id: authorId });
    checkError(error);
    return loadWorkspace();
  }

  return {
    loadWorkspace,
    createManualReview(title: string, draft: string) {
      return mutate("create_manual_review", {
        p_title: z.string().trim().min(1).max(200).parse(title),
        p_draft: z.string().trim().min(1).max(10000).parse(draft),
      });
    },
    decideApproval(id: string, action: ApprovalAction, expectedVersion: number) {
      z.uuid().parse(id);
      z.number().int().nonnegative().parse(expectedVersion);
      return mutate("decide_approval", {
        p_approval_id: id,
        p_action: action.type,
        p_expected_version: expectedVersion,
        p_draft: action.type === "edit" ? z.string().trim().min(1).max(10000).parse(action.draft) : null,
      });
    },
    teachRaven(id: string, text: string) {
      return mutate("teach_raven", {
        p_approval_id: z.uuid().parse(id),
        p_feedback: z.string().trim().min(1).max(4000).parse(text),
      });
    },
    queueRecommendation(id: string) {
      return mutate("queue_recommendation", { p_recommendation_id: z.uuid().parse(id) });
    },
    dismissRecommendation(id: string) {
      return mutate("dismiss_recommendation", { p_recommendation_id: z.uuid().parse(id) });
    },
    restoreRecommendations() {
      return mutate("restore_recommendations", {});
    },
  };
}
