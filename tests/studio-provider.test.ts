import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ credits: vi.fn(), generate: vi.fn(), agent: vi.fn(), gateway: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("ai", async importOriginal => ({
  ...await importOriginal<typeof import("ai")>(),
  createGateway: () => Object.assign(mocks.gateway, { getCredits: mocks.credits }),
  isStepCount: (steps: number) => steps, Output: { object: (value: unknown) => value },
  ToolLoopAgent: class { constructor(options: unknown) { mocks.agent(options); } generate = mocks.generate; },
}));
import { getStudioAvailability, StudioProviderError } from "@/lib/ai/studio-provider";
import { runStudioProvider } from "@/lib/ai/provider";
import { assertStudioPrompt, studioUsage, validateStudioOutput } from "@/lib/ai/studio-contract";
const request = { id: "10000000-0000-4000-8000-000000000001", job: "brainstorm" as const, prompt: "I have two hours to think about my book business." };
const output = { kind: "ideas", title: "A useful direction", summary: "Try something small.", options: [{ title: "One option", idea: "Review approved material.", tradeoff: "It takes time.", first_step: "Choose a book.", verify: [] }], questions: [], context_used: ["I have two hours"] };
const configured = { KIRA_AI_ENABLED: "true", KIRA_AI_RECORDING_KEY: "a".repeat(64) };
describe("bounded studio provider", () => {
  beforeEach(() => { mocks.credits.mockResolvedValue({ balance: "5.00" }); mocks.generate.mockResolvedValue({ output, totalUsage: { inputTokens: 100, outputTokens: 50 }, providerMetadata: { gateway: { generationId: "gen_123" } } }); });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it("fails closed without enabling or when Gateway credits cannot be verified", async () => {
    expect((await getStudioAvailability({})).reason).toBe("disabled");
    expect(mocks.credits).not.toHaveBeenCalled();
    expect((await getStudioAvailability({ KIRA_AI_ENABLED: "true" })).reason).toBe("unavailable");
    expect(mocks.credits).not.toHaveBeenCalled();
    mocks.credits.mockResolvedValueOnce({ balance: "0" });
    expect((await getStudioAvailability(configured)).reason).toBe("funding");
    mocks.credits.mockRejectedValueOnce(new Error("secret-token-from-provider"));
    const unavailable = await getStudioAvailability(configured);
    expect(unavailable).toMatchObject({ available: false, reason: "unavailable" });
    expect(JSON.stringify(unavailable)).not.toContain("secret-token");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("uses separate system instructions, no tools, one step, zero retries, and bounded output/time", async () => {
    const reply = await runStudioProvider(request);
    expect(reply.result).toEqual(output);
    expect(reply.usage).toEqual({ inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.0002625, gatewayGenerationId: "gen_123" });
    const options = mocks.agent.mock.calls[0][0];
    expect(options).toMatchObject({ allowSystemInMessages: false, stopWhen: 1, maxRetries: 0, maxOutputTokens: 3000 });
    expect(options).not.toHaveProperty("tools");
    expect(options.instructions).toContain("Never write, rewrite, finish, or generate fiction");
    expect(options.instructions).not.toContain(request.prompt);
    expect(mocks.generate).toHaveBeenCalledWith({ prompt: JSON.stringify({ job: request.job, user_context: request.prompt, book_reference: null }), timeout: 45000 });
  });
  it("blocks explicit fiction requests before invoking a provider", async () => {
    await expect(runStudioProvider({ ...request, prompt: "Please write a new chapter of my novel." })).rejects.toThrow(/fiction/);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(() => assertStudioPrompt("Help me draft a marketing plan for my novel.")).not.toThrow();
    expect(() => assertStudioPrompt("Help with my business. Do not write or rewrite fiction.")).not.toThrow();
  });
  it("rejects invented evidence and records a sanitized failure with known usage", async () => {
    mocks.generate.mockResolvedValueOnce({ output: { ...output, context_used: ["made-up source"] }, totalUsage: { inputTokens: 100, outputTokens: 50 } });
    await expect(runStudioProvider(request)).rejects.toMatchObject({ code: "invalid_output", usage: { inputTokens: 100, outputTokens: 50 } });
    mocks.generate.mockRejectedValueOnce(Object.assign(new Error("private provider body and Bearer token"), { statusCode: 402 }));
    try { await runStudioProvider(request); } catch (error) {
      expect(error).toBeInstanceOf(StudioProviderError); expect(error).toMatchObject({ code: "funding_required" });
      expect(JSON.stringify(error)).not.toMatch(/private provider|Bearer/);
    }
  });
  it("keeps unknown token usage unknown and rejects malformed boundary answers", () => {
    expect(studioUsage(undefined, undefined, "secret/url")).toEqual({ inputTokens: null, outputTokens: null, estimatedCostUsd: null, gatewayGenerationId: null });
    expect(() => validateStudioOutput({ ...output, kind: "boundary" }, request.prompt)).toThrow();
  });
});
