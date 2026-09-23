import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), generate: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/config", () => ({ getWorkspaceConfig: () => ({ mode: "connected", configured: true, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public-test-key" }) }));
vi.mock("@/lib/ai/provider", () => ({ runManuscriptExtraction: mocks.generate }));
import { batchIdFor, processBackgroundBatch, recoveryBatchIdFor } from "@/lib/manuscripts/background";
import { ManuscriptProviderError, emptyManuscriptUsage } from "@/lib/manuscripts/provider";
const job = randomUUID();
const chunk = { id: randomUUID(), chunk_index: 0, section: "Sample", reference_text: "SYNTHETIC reference", content_hash: "a".repeat(64) };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("KIRA_AI_RECORDING_KEY", "a".repeat(64)); vi.stubEnv("KIRA_AI_ENABLED", "true"); });
describe("background manuscript provider boundary", () => {
  it("does not call AI for duplicate, paused, revoked or completed work", async () => {
    for (const state of ["paused", "needs_attention", "complete", "superseded", "running"]) {
      mocks.rpc.mockResolvedValueOnce({ data: { state, created: false, chunks: [] }, error: null });
      expect(await processBackgroundBatch(job, "run", 0)).toBe(state);
    }
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("retries only the result write and never leaks private text into its returned state", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: "running", created: true, chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "connection_error" } })
      .mockResolvedValueOnce({ data: { state: "complete" }, error: null });
    mocks.generate.mockResolvedValue({ result: { facts: [], characters: [] }, usage: {}, embeddings: [] });
    expect(await processBackgroundBatch(job, "run", 4)).toBe("complete");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[2]);
    expect(mocks.rpc.mock.calls[0][1].p_batch_id).toBe(batchIdFor(job, 4));
  });
  it("records a provider failure once without automatic paid retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: "running", created: true, chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: { state: "needs_attention" }, error: null });
    mocks.generate.mockRejectedValue(new Error("private provider response"));
    expect(await processBackgroundBatch(job, "run", 0)).toBe("needs_attention");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    const payload = mocks.rpc.mock.calls[1][1].p_payload;
    expect(payload).toMatchObject({ result: null, embeddings: [], errorCode: "provider_unavailable" });
    expect(JSON.stringify(payload)).not.toContain("private provider response");
  });
  it("runs one separately reserved recovery for a known invalid output and saves its own usage", async () => {
    const initial = batchIdFor(job, 0), recovery = recoveryBatchIdFor(initial);
    const firstUsage = { ...emptyManuscriptUsage(), inputTokens: 100 };
    const secondUsage = { ...emptyManuscriptUsage(), inputTokens: 110 };
    mocks.rpc.mockResolvedValueOnce({ data: { state: "running", created: true, chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: { state: "running", created: true, recoveryBatchId: recovery, chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: { state: "complete", created: false }, error: null });
    mocks.generate.mockRejectedValueOnce(new ManuscriptProviderError("invalid_output", firstUsage))
      .mockResolvedValueOnce({ result: { facts: [], characters: [] }, usage: secondUsage, embeddings: [] });
    expect(await processBackgroundBatch(job, "run", 0)).toBe("complete");
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[0]).toEqual(mocks.generate.mock.calls[1]);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_batch_id: initial, p_payload: { errorCode: "invalid_output", usage: firstUsage, recoveryBatchId: recovery } });
    expect(mocks.rpc.mock.calls[2][1]).toMatchObject({ p_batch_id: recovery, p_payload: { errorCode: null, usage: secondUsage } });
    expect(mocks.rpc.mock.calls[2][1].p_payload).not.toHaveProperty("recoveryBatchId");
    expect(recovery).not.toBe(initial);
  });
  it("stops after a failed recovery without requesting a third paid attempt", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: "running", created: true, chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: { state: "running", created: true, recoveryBatchId: recoveryBatchIdFor(batchIdFor(job, 0)), chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: { state: "needs_attention", created: false }, error: null });
    mocks.generate.mockRejectedValue(new ManuscriptProviderError("invalid_output", emptyManuscriptUsage()));
    expect(await processBackgroundBatch(job, "run", 0)).toBe("needs_attention");
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[2][1].p_payload).not.toHaveProperty("recoveryBatchId");
  });
  it.each(["paused", "needs_attention", "superseded", "complete"])("obeys a %s response rather than retrying locally", async state => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: "running", created: true, chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: { state, created: false }, error: null });
    mocks.generate.mockRejectedValue(new ManuscriptProviderError("invalid_output", emptyManuscriptUsage()));
    expect(await processBackgroundBatch(job, "run", 0)).toBe(state);
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("does not generate when a reservation succeeded but its response was lost", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: "running", created: true, chunks: [chunk] }, error: null })
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ data: { state: "running", created: false, recoveryPending: true, chunks: [] }, error: null })
      .mockResolvedValueOnce({ data: { state: "needs_attention" }, error: null });
    mocks.generate.mockRejectedValue(new ManuscriptProviderError("invalid_output", emptyManuscriptUsage()));
    expect(await processBackgroundBatch(job, "run", 0)).toBe("needs_attention");
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[2]);
    expect(mocks.rpc.mock.calls[3][1].p_action).toBe("attention");
  });
  it("rejects a recovery reservation for different passages", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: "running", created: true, chunks: [chunk] }, error: null })
      .mockResolvedValueOnce({ data: { state: "running", created: true, recoveryBatchId: recoveryBatchIdFor(batchIdFor(job, 0)), chunks: [{ ...chunk, id: randomUUID() }] }, error: null })
      .mockResolvedValueOnce({ data: { state: "needs_attention" }, error: null });
    mocks.generate.mockRejectedValue(new ManuscriptProviderError("invalid_output", emptyManuscriptUsage()));
    expect(await processBackgroundBatch(job, "run", 0)).toBe("needs_attention");
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
});
