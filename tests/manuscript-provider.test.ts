import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { randomUUID, createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ generate: vi.fn(), embedMany: vi.fn(), settings: {} as Record<string, unknown> }));
vi.mock("ai", async importOriginal => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    createGateway: () => Object.assign(() => "model", { embeddingModel: () => "embedding" }),
    embedMany: mocks.embedMany, isStepCount: () => "one-step", Output: actual.Output, jsonSchema: actual.jsonSchema,
    NoOutputGeneratedError: actual.NoOutputGeneratedError,
    ToolLoopAgent: class { constructor(settings: Record<string,unknown>) { mocks.settings = settings; } generate = mocks.generate; },
  };
});
import { runManuscriptExtraction } from "@/lib/ai/provider";
import { NoOutputGeneratedError } from "ai";
import { ManuscriptProviderError, emptyManuscriptUsage } from "@/lib/manuscripts/provider";
import { validateManuscriptExtraction, type ManuscriptChunk } from "@/lib/manuscripts/contract";
const text = "Rowan is listed as the coordinator in the synthetic source record.";
const chunk: ManuscriptChunk = { id: randomUUID(),chunk_index:0,section:"Section 1",reference_text:text,content_hash:createHash("sha256").update(text).digest("hex") };
const result = { facts:[{category:"setting",statement:"A coordinator is listed.",kind:"supported",spoiler:true,citations:[{chunk_id:chunk.id,quote:"Rowan is listed as the coordinator"}]}],characters:[] };
describe("bounded manuscript intelligence provider", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "warn").mockImplementation(() => {}); mocks.generate.mockResolvedValue({output:result,totalUsage:{inputTokens:100,outputTokens:50},providerMetadata:{gateway:{generationId:"gen_fixture"}}}); mocks.embedMany.mockResolvedValue({embeddings:[Array.from({length:1536},()=>0.01)],usage:{tokens:20}}); });
  afterEach(() => { vi.restoreAllMocks(); });
  it("requires stored source permission before any provider use", async () => {
    await expect(runManuscriptExtraction([chunk],{sourceApproved:false})).rejects.toThrow(/approved source/); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("uses a fixed no-tools policy, bounded calls, exact citations and usage records", async () => {
    const reply = await runManuscriptExtraction([chunk],{sourceApproved:true});
    expect(reply.result).toEqual(result); expect(reply.usage).toMatchObject({inputTokens:100,outputTokens:50,embeddingTokens:20,gatewayGenerationId:"gen_fixture",embedding_status:"complete"});
    expect(mocks.settings).toMatchObject({maxRetries:0,allowSystemInMessages:false,providerOptions:{google:{thinkingConfig:{thinkingLevel:"low",includeThoughts:false}}}});
    expect(mocks.settings.instructions).toMatch(/untrusted DATA/); expect(mocks.settings.instructions).toMatch(/Never write/);
    expect(mocks.settings.instructions).toMatch(/at most 16 facts and 8 character observations/);
    const output = mocks.settings.output as ReturnType<typeof import("ai").Output.object>;
    const transport = JSON.stringify(await output.responseFormat);
    expect(transport).toContain('"chunk_id":{"type":"string"}');
    expect(transport).not.toMatch(/"format"|"pattern"|"maxItems"|"maxLength"/);
    expect(mocks.embedMany).toHaveBeenCalledWith(expect.objectContaining({maxRetries:0,maxParallelCalls:1,providerOptions:{openai:{dimensions:1536}}}));
    expect(reply.embeddings[0].chunk_id).toBe(chunk.id);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("rejects invented, foreign and altered source citations", () => {
    for(const citation of [{chunk_id:randomUUID(),quote:"Rowan"},{chunk_id:chunk.id,quote:"Invented text"}]) expect(()=>validateManuscriptExtraction({...result,facts:[{...result.facts[0],citations:[citation]}]},[chunk])).toThrow(/citation/);
  });
  it("does not persist fabricated results or embed failed extraction", async () => {
    mocks.generate.mockResolvedValueOnce({output:{...result,facts:[{...result.facts[0],citations:[{chunk_id:chunk.id,quote:"not present"}]}]},totalUsage:{inputTokens:100,outputTokens:50}});
    await expect(runManuscriptExtraction([chunk],{sourceApproved:true})).rejects.toMatchObject({code:"invalid_output",reason:"citation",usage:{inputTokens:100}}); expect(mocks.embedMany).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", { reason: "citation", gatewayGenerationId: null });
  });
  it("saves independently verified findings without repeating a paid call when another quote is unsupported", async () => {
    const unsupported = { ...result.facts[0], statement: "An unsupported observation.", citations: [{ chunk_id: chunk.id, quote: "not present" }] };
    mocks.generate.mockResolvedValueOnce({ output: { facts: [...result.facts, unsupported], characters: [] }, totalUsage: { inputTokens: 100, outputTokens: 50 } });
    const reply = await runManuscriptExtraction([chunk], { sourceApproved: true });
    expect(reply.result).toEqual(result);
    expect(() => validateManuscriptExtraction(reply.result, [chunk])).not.toThrow();
    expect(reply.usage.inputTokens).toBe(100);
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).toHaveBeenCalledOnce();
  });
  it("drops the entire candidate if any citation is foreign, even alongside a valid citation", async () => {
    const unsupported = { ...result.facts[0], citations: [...result.facts[0].citations, { chunk_id: randomUUID(), quote: "Rowan" }] };
    mocks.generate.mockResolvedValueOnce({ output: { facts: [...result.facts, unsupported], characters: [] }, totalUsage: { inputTokens: 100, outputTokens: 50 } });
    expect((await runManuscriptExtraction([chunk], { sourceApproved: true })).result).toEqual(result);
  });
  it("still rejects malformed output rather than silently dropping schema failures", async () => {
    mocks.generate.mockResolvedValueOnce({ output: { ...result, facts: [...result.facts, { ...result.facts[0], statement: "x".repeat(601) }] }, totalUsage: { inputTokens: 100, outputTokens: 50 } });
    await expect(runManuscriptExtraction([chunk], { sourceApproved: true })).rejects.toMatchObject({ code: "invalid_output", reason: "schema" });
    expect(mocks.embedMany).not.toHaveBeenCalled();
  });
  it("retains valid paid extraction when the optional embedding index fails", async () => {
    mocks.embedMany.mockRejectedValueOnce(new Error("private provider error"));
    const reply=await runManuscriptExtraction([chunk],{sourceApproved:true}); expect(reply.result).toEqual(result); expect(reply.embeddings).toEqual([]); expect(reply.usage.embedding_status).toBe("unavailable"); expect(mocks.generate).toHaveBeenCalledOnce();
    expect(console.warn).not.toHaveBeenCalled();
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
  it.each([
    ["AI_NoObjectGeneratedError", "empty_or_invalid_output"],
    ["AI_NoOutputGeneratedError", "empty_or_invalid_output"],
    ["AI_TypeValidationError", "schema"],
    ["AI_JSONParseError", "json"],
  ])("classifies %s without leaking the model response or retrying", async (name, reason) => {
    mocks.generate.mockImplementationOnce(() => {
      const onStepEnd = mocks.settings.onStepEnd as (step: unknown) => void;
      onStepEnd({ usage: { inputTokens: 100, outputTokens: 50 }, providerMetadata: { gateway: { generationId: "gen_fixture" } } });
      throw Object.assign(new Error("private-generated-source-text"), { name, text: "private-generated-source-text", response: { body: "private-provider-payload" } });
    });
    const failure = await runManuscriptExtraction([chunk], { sourceApproved: true }).catch(error => error as Error);
    expect(failure).toMatchObject({ code: "invalid_output", reason, usage: { inputTokens: 100, outputTokens: 50, gatewayGenerationId: "gen_fixture" } });
    expect(String(failure)).not.toMatch(/private-generated|private-provider/);
    expect(JSON.stringify(failure)).not.toMatch(/private-generated|private-provider/);
    expect(failure).not.toHaveProperty("cause"); expect(failure).not.toHaveProperty("text");
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", { reason, gatewayGenerationId: "gen_fixture" });
  });
  it.each([
    { finishReason: "stop" as const, text: '{"private-generated-source-text":', reason: "json" },
    { finishReason: "length" as const, text: '{"private-generated-source-text":', reason: "output_limit" },
    { finishReason: "stop" as const, text: JSON.stringify({ ...result, facts: [{ ...result.facts[0], statement: "private-generated-source-text".repeat(30) }] }), reason: "schema" },
  ])("classifies real Output.object failures as $reason and keeps recorded usage", async ({ finishReason, text, reason }) => {
    mocks.generate.mockImplementationOnce(async () => {
      const onStepEnd = mocks.settings.onStepEnd as (step: unknown) => void;
      onStepEnd({ usage: { inputTokens: 100, outputTokens: 50 }, providerMetadata: { gateway: { generationId: "gen_fixture" } } });
      const output = mocks.settings.output as ReturnType<typeof import("ai").Output.object>;
      return output.parseCompleteOutput({ text }, {
        finishReason,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }, outputTokenDetails: { textTokens: 50, reasoningTokens: 0 } },
        response: { id: "private-response-id", modelId: "private-model-id", timestamp: new Date() },
      });
    });
    const failure = await runManuscriptExtraction([chunk], { sourceApproved: true }).catch(error => error);
    expect(failure).toMatchObject({ code: "invalid_output", reason, usage: { inputTokens: 100, outputTokens: 50, gatewayGenerationId: "gen_fixture", embedding_status: "not_started" } });
    expect(JSON.stringify(failure)).not.toMatch(/private-|Rowan|coordinator/);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", {
      reason, gatewayGenerationId: "gen_fixture", ...(reason === "schema" ? { schemaIssues: [{ code: "too_big", field: "statement" }] } : {}),
    });
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).not.toHaveBeenCalled();
  });
  it.each([
    ["stop", "empty_or_invalid_output"],
    ["length", "output_limit"],
  ])("classifies the response.output getter when finishReason is %s", async (finishReason, reason) => {
    mocks.generate.mockResolvedValueOnce({
      totalUsage: { inputTokens: 100, outputTokens: 50 }, providerMetadata: { gateway: { generationId: "gen_fixture" } }, finishReason,
      get output() { throw new NoOutputGeneratedError({ message: "private-generated-source-text" }); },
    });
    await expect(runManuscriptExtraction([chunk], { sourceApproved: true })).rejects.toMatchObject({ code: "invalid_output", reason, usage: { inputTokens: 100, outputTokens: 50, gatewayGenerationId: "gen_fixture" } });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", { reason, gatewayGenerationId: "gen_fixture" });
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).not.toHaveBeenCalled();
  });
  it("never logs malicious nested errors, schema paths, unknown strings or unsafe generation IDs", async () => {
    const privateText = "private-manuscript-passage /private/file https://private.example";
    const cause = Object.assign(new Error(privateText), { name: "AI_TypeValidationError", value: { [privateText]: privateText }, issues: [{ path: [privateText], message: privateText }] });
    const error = Object.assign(new Error(privateText), { name: "AI_NoObjectGeneratedError", cause, text: privateText, response: { body: privateText, finishReason: "length" }, providerMetadata: { gateway: { generationId: "private_error_id" } } });
    Object.assign(cause, { cause: error });
    mocks.generate.mockImplementationOnce(() => {
      const onStepEnd = mocks.settings.onStepEnd as (step: unknown) => void;
      onStepEnd({ usage: { inputTokens: 100, outputTokens: 50 }, providerMetadata: { gateway: { generationId: privateText } } });
      throw error;
    });
    const failure = await runManuscriptExtraction([chunk], { sourceApproved: true }).catch(error => error);
    expect(failure).toMatchObject({ code: "invalid_output", reason: "schema", usage: { inputTokens: 100, outputTokens: 50, gatewayGenerationId: null } });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", { reason: "schema", gatewayGenerationId: null });
    expect(JSON.stringify(failure)).not.toContain("private");
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).not.toHaveBeenCalled();
  });
  it("ignores unrecognized diagnostic strings and does not invoke cause accessors", async () => {
    const readCause = vi.fn(() => { throw new Error("private-accessor"); });
    const error = Object.assign(new Error("length AI_TypeValidationError private-source"), { name: "AI_NoObjectGeneratedError", finishReason: "private-finish-reason", response: { finishReason: "length" } });
    Object.defineProperty(error, "cause", { get: readCause });
    mocks.generate.mockRejectedValueOnce(error);
    await expect(runManuscriptExtraction([chunk], { sourceApproved: true })).rejects.toMatchObject({ code: "invalid_output", reason: "empty_or_invalid_output" });
    expect(readCause).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", { reason: "empty_or_invalid_output", gatewayGenerationId: null });
  });
  it("reports only bounded allowlisted schema issue codes and fields", async () => {
    const privateText = "private-manuscript-field /private/file";
    const readCode = vi.fn(() => { throw new Error(privateText); });
    const issues = [
      { code: "too_big", path: ["facts", 0, "statement"], message: privateText, input: privateText },
      { code: "unrecognized_keys", path: [], keys: [privateText], message: privateText },
      { code: "invalid_type", path: ["characters", 0, privateText], expected: privateText, message: privateText },
      { code: privateText, path: ["facts"], message: privateText },
      { get code() { return readCode(); }, path: ["facts"] },
      ...Array.from({ length: 20 }, () => ({ code: "custom", path: ["facts", 0, "citations", 0, "quote"], message: privateText })),
    ];
    mocks.generate.mockRejectedValueOnce(Object.assign(new Error(privateText), {
      name: "AI_NoObjectGeneratedError",
      cause: Object.assign(new Error(privateText), { name: "AI_TypeValidationError", cause: { name: "ZodError", issues } }),
    }));
    const schemaIssues = [
      { code: "too_big", field: "statement" }, { code: "unrecognized_keys", field: "envelope" }, { code: "invalid_type", field: "envelope" },
      ...Array.from({ length: 3 }, () => ({ code: "custom", field: "quote" })),
    ];
    const failure = await runManuscriptExtraction([chunk], { sourceApproved: true }).catch(error => error);
    expect(failure).toMatchObject({ code: "invalid_output", reason: "schema", schemaIssues });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", { reason: "schema", gatewayGenerationId: null, schemaIssues });
    expect(readCode).not.toHaveBeenCalled();
    expect(JSON.stringify(failure)).not.toContain("private");
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).not.toHaveBeenCalled();
  });
  it("does not log unexpected model field names from actual local schema validation", async () => {
    mocks.generate.mockResolvedValueOnce({ output: { ...result, "private-manuscript-field": "private-passage" }, totalUsage: { inputTokens: 100, outputTokens: 50 } });
    await expect(runManuscriptExtraction([chunk], { sourceApproved: true })).rejects.toMatchObject({ code: "invalid_output", reason: "schema", schemaIssues: [{ code: "unrecognized_keys", field: "envelope" }] });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Manuscript extraction failed response checks.", { reason: "schema", gatewayGenerationId: null, schemaIssues: [{ code: "unrecognized_keys", field: "envelope" }] });
  });
  it("defaults legacy invalid-output errors to a safe reason", () => {
    expect(new ManuscriptProviderError("invalid_output", emptyManuscriptUsage()).reason).toBe("empty_or_invalid_output");
    expect(new ManuscriptProviderError("timeout", emptyManuscriptUsage()).reason).toBeUndefined();
  });
  it.each(["AbortError", "TimeoutError"])("preserves timeout handling for DOMException %s", async name => {
    const error = new DOMException("private-provider-timeout", name);
    const readName = vi.fn(() => { throw new Error("private-accessor"); });
    Object.defineProperty(error, "name", { get: readName });
    mocks.generate.mockRejectedValueOnce(error);
    await expect(runManuscriptExtraction([chunk], { sourceApproved: true })).rejects.toMatchObject({ code: "timeout", reason: undefined });
    expect(readName).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.embedMany).not.toHaveBeenCalled();
  });
});
