import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getWorkspaceConfig } from "@/lib/config";
import { runManuscriptExtraction } from "@/lib/ai/provider";
import { emptyManuscriptUsage, ManuscriptProviderError } from "./provider";
import { checkLibraryError, storedChunkSchema } from "./repository";

const responseSchema = z.object({
  state: z.enum(["queued", "running", "paused", "needs_attention", "complete", "superseded"]),
  created: z.boolean().optional(), chunks: storedChunkSchema.array().max(4).optional(),
  recoveryBatchId: z.uuid().optional(), recoveryPending: z.boolean().optional(),
});
export function batchIdFor(jobId: string, sequence: number) {
  return deterministicId(`${jobId}:${sequence}`);
}
export function recoveryBatchIdFor(batchId: string) {
  return deterministicId(`manuscript-recovery:${batchId}`);
}
function deterministicId(value: string) {
  const hex = createHash("sha256").update(value).digest("hex");
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
    if (claimed.state !== "running" || !claimed.chunks?.length) throw new Error("Invalid reading reservation.");
    let currentBatchId = batchId;
    let chunks = claimed.chunks;
    // The database must persist each attempt before generation. Only a known
    // invalid output may reserve one recovery for this exact set of passages.
    for (let attempt = 0; attempt < 2; attempt++) {
      let payload;
      try {
        const reply = await runManuscriptExtraction(chunks, { sourceApproved: true });
        payload = { result: reply.result, usage: reply.usage, embeddings: reply.embeddings, errorCode: null };
      } catch (error) {
        payload = { result: null, usage: error instanceof ManuscriptProviderError ? error.usage : emptyManuscriptUsage(), embeddings: [], errorCode: error instanceof ManuscriptProviderError ? error.code : "provider_unavailable" };
      }
      const recoveryBatchId = attempt === 0 && payload.errorCode === "invalid_output" ? recoveryBatchIdFor(batchId) : undefined;
      const write = () => rpc(jobId, runId, "finish", currentBatchId, { ...payload, ...(recoveryBatchId ? { recoveryBatchId } : {}) });
      // Retrying persistence cannot reauthorize generation for an existing reservation.
      const saved = await write().catch(() => write());
      if (saved.recoveryPending) throw new Error("Recovery reservation outcome needs attention.");
      if (!saved.created) return saved.state;
      if (!recoveryBatchId || saved.recoveryBatchId !== recoveryBatchId || saved.state !== "running" ||
        !saved.chunks?.length || saved.chunks.length !== chunks.length ||
        saved.chunks.some((chunk, index) => chunk.id !== chunks[index].id || chunk.content_hash !== chunks[index].content_hash) ||
        process.env.KIRA_AI_ENABLED !== "true") throw new Error("Invalid recovery reservation.");
      currentBatchId = recoveryBatchId;
      chunks = saved.chunks;
    }
    throw new Error("Recovery limit reached.");
  } catch {
    await rpc(jobId, runId, "attention", null).catch(() => {});
    return "needs_attention";
  }
}
