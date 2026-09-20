import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getWorkspaceConfig } from "@/lib/config";
import { runManuscriptExtraction } from "@/lib/ai/provider";
import { emptyManuscriptUsage, ManuscriptProviderError } from "./provider";
import { checkLibraryError, storedChunkSchema } from "./repository";

const responseSchema = z.object({ state: z.string(), created: z.boolean().optional(), chunks: storedChunkSchema.array().optional() });
export function batchIdFor(jobId: string, sequence: number) {
  const hex = createHash("sha256").update(`${jobId}:${sequence}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function workerClient() {
  const config = getWorkspaceConfig(); const key = process.env.KIRA_AI_RECORDING_KEY;
  if (config.mode !== "connected" || !config.configured || !config.supabaseUrl || !config.supabasePublishableKey || !key || !/^[a-f\d]{64}$/i.test(key)) throw new Error("Background reading is not configured.");
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (jobId: string, runId: string, action: string, batchId: string | null, payload: unknown = {}) => {
    const { data, error } = await client.rpc("manuscript_reading_worker", { p_job_id: jobId, p_run_id: runId, p_action: action, p_batch_id: batchId, p_payload: payload, p_recording_key: key });
    checkLibraryError(error); return responseSchema.parse(data);
  };
}
/** Private passages and model results stay inside this invocation, never in workflow arguments/results. */
export async function processBackgroundBatch(jobId: string, runId: string, sequence: number): Promise<string> {
  const rpc = workerClient(); const batchId = batchIdFor(jobId, sequence);
  try {
    if (process.env.KIRA_AI_ENABLED !== "true") { await rpc(jobId, runId, "attention", null); return "needs_attention"; }
    const claimed = await rpc(jobId, runId, "claim", batchId);
    if (!claimed.created) return claimed.state;
    let payload;
    try {
      const reply = await runManuscriptExtraction(claimed.chunks!, { sourceApproved: true });
      payload = { result: reply.result, usage: reply.usage, embeddings: reply.embeddings, errorCode: null };
    } catch (error) {
      payload = { result: null, usage: error instanceof ManuscriptProviderError ? error.usage : emptyManuscriptUsage(), embeddings: [], errorCode: error instanceof ManuscriptProviderError ? error.code : "provider_unavailable" };
    }
    // Only retry the idempotent database write, never the paid generation.
    const write = () => rpc(jobId, runId, "finish", batchId, payload);
    const saved = await write().catch(() => write());
    return saved.state;
  } catch {
    await rpc(jobId, runId, "attention", null).catch(() => {});
    return "needs_attention";
  }
}
