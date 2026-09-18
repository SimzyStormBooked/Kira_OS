import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { studioGenerationSchema, type StudioFailureCode, type StudioReply, type StudioRequest, type StudioUsage } from "@/lib/ai/studio-contract";

export class StudioRepositoryError extends Error {
  constructor(public readonly code: string) { super("The saved AI request is unavailable."); this.name = "StudioRepositoryError"; }
}
const columns = "id,author_id,created_by,job,prompt,model,status,result,input_tokens,output_tokens,estimated_cost_usd,gateway_generation_id,error_code,created_at,completed_at";
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
    async list() {
      const { data, error } = await supabase.from("workspace_generations").select(columns).eq("author_id", authorId).order("created_at", { ascending: false }).limit(50);
      if (error) throw new StudioRepositoryError(error.code ?? "unavailable");
      return studioGenerationSchema.array().parse(data ?? []);
    },
    async find(id: string) {
      const { data, error } = await supabase.from("workspace_generations").select(columns).eq("author_id", authorId).eq("id", id).maybeSingle();
      if (error) throw new StudioRepositoryError(error.code ?? "unavailable");
      return data ? studioGenerationSchema.parse(data) : null;
    },
    async begin(input: StudioRequest) {
      const { data, error } = await supabase.rpc("workspace_generation_begin", { p_author_id: authorId, p_id: input.id, p_job: input.job, p_prompt: input.prompt, p_recording_key: recordingKey() });
      if (error) throw new StudioRepositoryError(error.code ?? "unavailable");
      return z.object({ created: z.boolean(), generation: studioGenerationSchema }).parse(data);
    },
    complete(id: string, reply: StudioReply) { return finish(id, reply, null, reply.usage); },
    fail(id: string, code: StudioFailureCode, usage: StudioUsage) { return finish(id, null, code, usage); },
  };
}
