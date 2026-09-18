import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomUUID, createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ generate: vi.fn(), embedMany: vi.fn(), settings: {} as Record<string, unknown> }));
vi.mock("ai", async importOriginal => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    createGateway: () => Object.assign(() => "model", { embeddingModel: () => "embedding" }),
    embedMany: mocks.embedMany, isStepCount: () => "one-step", Output: actual.Output, jsonSchema: actual.jsonSchema,
    ToolLoopAgent: class { constructor(settings: Record<string,unknown>) { mocks.settings = settings; } generate = mocks.generate; },
  };
});
import { runManuscriptExtraction } from "@/lib/ai/provider";
import { validateManuscriptExtraction, type ManuscriptChunk } from "@/lib/manuscripts/contract";
const text = "Rowan is listed as the coordinator in the synthetic source record.";
const chunk: ManuscriptChunk = { id: randomUUID(),chunk_index:0,section:"Section 1",reference_text:text,content_hash:createHash("sha256").update(text).digest("hex") };
const result = { facts:[{category:"setting",statement:"A coordinator is listed.",kind:"supported",spoiler:true,citations:[{chunk_id:chunk.id,quote:"Rowan is listed as the coordinator"}]}],characters:[] };
describe("bounded manuscript intelligence provider", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.generate.mockResolvedValue({output:result,totalUsage:{inputTokens:100,outputTokens:50},providerMetadata:{gateway:{generationId:"gen_fixture"}}}); mocks.embedMany.mockResolvedValue({embeddings:[Array.from({length:1536},()=>0.01)],usage:{tokens:20}}); });
  it("requires stored source permission before any provider use", async () => {
    await expect(runManuscriptExtraction([chunk],{sourceApproved:false})).rejects.toThrow(/approved source/); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("uses a fixed no-tools policy, bounded calls, exact citations and usage records", async () => {
    const reply = await runManuscriptExtraction([chunk],{sourceApproved:true});
    expect(reply.result).toEqual(result); expect(reply.usage).toMatchObject({inputTokens:100,outputTokens:50,embeddingTokens:20,gatewayGenerationId:"gen_fixture",embedding_status:"complete"});
    expect(mocks.settings).toMatchObject({maxRetries:0,allowSystemInMessages:false});
    expect(mocks.settings.instructions).toMatch(/untrusted DATA/); expect(mocks.settings.instructions).toMatch(/Never write/);
    expect(mocks.settings.instructions).toMatch(/at most 16 facts and 8 character observations/);
    const output = mocks.settings.output as ReturnType<typeof import("ai").Output.object>;
    const transport = JSON.stringify(await output.responseFormat);
    expect(transport).toContain('"chunk_id":{"type":"string"}');
    expect(transport).not.toMatch(/"format"|"pattern"|"maxItems"|"maxLength"/);
    expect(mocks.embedMany).toHaveBeenCalledWith(expect.objectContaining({maxRetries:0,maxParallelCalls:1,providerOptions:{openai:{dimensions:1536}}}));
    expect(reply.embeddings[0].chunk_id).toBe(chunk.id);
  });
  it("rejects invented, foreign and altered source citations", () => {
    for(const citation of [{chunk_id:randomUUID(),quote:"Rowan"},{chunk_id:chunk.id,quote:"Invented text"}]) expect(()=>validateManuscriptExtraction({...result,facts:[{...result.facts[0],citations:[citation]}]},[chunk])).toThrow(/citation/);
  });
  it("does not persist fabricated results or embed failed extraction", async () => {
    mocks.generate.mockResolvedValueOnce({output:{...result,facts:[{...result.facts[0],citations:[{chunk_id:chunk.id,quote:"not present"}]}]},totalUsage:{inputTokens:100,outputTokens:50}});
    await expect(runManuscriptExtraction([chunk],{sourceApproved:true})).rejects.toMatchObject({code:"invalid_output",usage:{inputTokens:100}}); expect(mocks.embedMany).not.toHaveBeenCalled();
  });
  it("retains valid paid extraction when the optional embedding index fails", async () => {
    mocks.embedMany.mockRejectedValueOnce(new Error("private provider error"));
    const reply=await runManuscriptExtraction([chunk],{sourceApproved:true}); expect(reply.result).toEqual(result); expect(reply.embeddings).toEqual([]); expect(reply.usage.embedding_status).toBe("unavailable"); expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it.each([
    { name: "zero magnitude", vector: Array<number>(1536).fill(0) },
    { name: "float32 overflow", vector: Array<number>(1536).fill(1e100) },
    { name: "components beyond the database bound", vector: Array<number>(1536).fill(1e7) },
    { name: "float32 underflow to zero", vector: Array<number>(1536).fill(1e-100) },
    { name: "nonfinite components", vector: Array<number>(1536).fill(Number.NaN) },
    { name: "wrong dimensions", vector: [0.01] },
  ])("preserves paid findings and usage when optional embeddings have $name", async ({ vector }) => {
    mocks.embedMany.mockResolvedValueOnce({ embeddings: [vector], usage: { tokens: 20 } });
    const reply = await runManuscriptExtraction([chunk], { sourceApproved: true });
    expect(reply.result).toEqual(result);
    expect(reply.embeddings).toEqual([]);
    expect(reply.usage).toMatchObject({ embedding_status: "unavailable", inputTokens: 100, outputTokens: 50, embeddingTokens: 20, gatewayGenerationId: "gen_fixture" });
    expect(reply.usage.estimatedCostUsd).toBeGreaterThan(0);
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).toHaveBeenCalledOnce();
  });
  it("stores optional index components at the database's float32 precision", async () => {
    const reply = await runManuscriptExtraction([chunk], { sourceApproved: true });
    expect(reply.usage.embedding_status).toBe("complete");
    expect(reply.embeddings[0].embedding).toEqual(Array<number>(1536).fill(Math.fround(0.01)));
  });
  it("sanitizes provider failures and never retries a paid call", async () => {
    mocks.generate.mockRejectedValueOnce(Object.assign(new Error("secret-provider-debug-token"),{statusCode:402}));
    const promise=runManuscriptExtraction([chunk],{sourceApproved:true}); await expect(promise).rejects.toMatchObject({code:"funding_required"}); await expect(promise).rejects.not.toThrow(/secret/); expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it.each(["AI_NoObjectGeneratedError", "AI_TypeValidationError", "AI_JSONParseError"])("classifies %s without leaking the model response or retrying", async name => {
    mocks.generate.mockImplementationOnce(() => {
      const onStepEnd = mocks.settings.onStepEnd as (step: unknown) => void;
      onStepEnd({ usage: { inputTokens: 100, outputTokens: 50 }, providerMetadata: { gateway: { generationId: "gen_fixture" } } });
      throw Object.assign(new Error("private-generated-source-text"), { name, text: "private-generated-source-text", response: { body: "private-provider-payload" } });
    });
    const failure = await runManuscriptExtraction([chunk], { sourceApproved: true }).catch(error => error as Error);
    expect(failure).toMatchObject({ code: "invalid_output", usage: { inputTokens: 100, outputTokens: 50, gatewayGenerationId: "gen_fixture" } });
    expect(String(failure)).not.toMatch(/private-generated|private-provider/);
    expect(JSON.stringify(failure)).not.toMatch(/private-generated|private-provider/);
    expect(failure).not.toHaveProperty("cause"); expect(failure).not.toHaveProperty("text");
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).not.toHaveBeenCalled();
  });
});
