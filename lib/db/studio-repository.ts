import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { studioGenerationSchema, type StudioFailureCode, type StudioReply, type StudioRequest, type StudioUsage } from "@/lib/ai/studio-contract";

export class StudioRepositoryError extends Error {
  constructor(public readonly code: string) { super("The saved AI request is unavailable."); this.name = "StudioRepositoryError"; }
}
const columns = "id,author_id,created_by,job,prompt,model,status,result,input_tokens,output_tokens,estimated_cost_usd,gateway_generation_id,error_code,created_at,completed_at,knowledge_context";
const historyCursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid(), query: z.string().max(200) }).strict();
export const studioHistoryQuerySchema = z.object({
  query: z.string().trim().max(200).default(""),
  cursor: z.string().min(1).max(600).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export function readStudioHistoryCursor(cursor: string | undefined, query: string) {
  if (!cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const value = historyCursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (value.query !== query) throw new Error();
    return value;
  } catch { throw new StudioRepositoryError("invalid_cursor"); }
}
export function createStudioRepository(supabase: SupabaseClient, authorId: string) {
  function recordingKey() {
    const value = process.env.KIRA_AI_RECORDING_KEY;
    if (!value || !/^[A-Fa-f0-9]{64}$/.test(value)) throw new StudioRepositoryError("unavailable");
    return value;
  }
  async function finish(id: string, reply: StudioReply | null, errorCode: StudioFailureCode | null, usage: StudioUsage) {
    const { data, error } = await supabase.rpc("workspace_generation_finish", {
      p_author_id: authorId, p_id: id, p_status: reply ? "complete" : "failed", p_result: reply?.result ?? null,
      p_error_code: errorCode, p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens,
      p_estimated_cost_usd: usage.estimatedCostUsd, p_gateway_generation_id: usage.gatewayGenerationId,
      p_recording_key: recordingKey(),
    });
    if (error) throw new StudioRepositoryError(error.code ?? "unavailable");
    return studioGenerationSchema.parse(data);
  }
  return {
    async list(input: { query?: string; cursor?: string; limit?: number; completedOnly?: boolean } = {}) {
      const { query, cursor, limit } = studioHistoryQuerySchema.parse(input);
      const before = readStudioHistoryCursor(cursor, query);
      const { data, error } = await supabase.rpc("workspace_generation_history", {
        p_author_id: authorId, p_query: query, p_before_created_at: before?.createdAt ?? null,
        p_before_id: before?.id ?? null, p_limit: limit + 1, p_completed_only: input.completedOnly ?? false,
      }).select(columns);
      if (error) throw new StudioRepositoryError(error.code ?? "unavailable");
      const rows = studioGenerationSchema.array().parse(data ?? []);
      const generations = rows.slice(0, limit);
      const last = generations.at(-1);
      const nextCursor = rows.length > limit && last
        ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id, query })).toString("base64url") : null;
      return { generations, nextCursor };
    },
    async find(id: string) {
      const { data, error } = await supabase.from("workspace_generations").select(columns).eq("author_id", authorId).eq("id", id).maybeSingle();
      if (error) throw new StudioRepositoryError(error.code ?? "unavailable");
      return data ? studioGenerationSchema.parse(data) : null;
    },
    async begin(input: StudioRequest) {
      const { data, error } = await supabase.rpc(input.bookIds?.length ? "workspace_generation_begin_context" : "workspace_generation_begin", { ...(input.bookIds?.length ? {p_books:input.bookIds,p_spoilers:input.includeSpoilers??false} : {}), p_author_id: authorId, p_id: input.id, p_job: input.job, p_prompt: input.prompt, p_recording_key: recordingKey() });
      if (error) throw new StudioRepositoryError(error.code ?? "unavailable");
      return z.object({ created: z.boolean(), generation: studioGenerationSchema }).parse(data);
    },
    complete(id: string, reply: StudioReply) { return finish(id, reply, null, reply.usage); },
    fail(id: string, code: StudioFailureCode, usage: StudioUsage) { return finish(id, null, code, usage); },
  };
}
