import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Output } from "ai";
vi.mock("server-only", () => ({}));
import { manuscriptModelSchema } from "@/lib/manuscripts/model-schema";
import { manuscriptExtractionSchema, validateManuscriptExtraction, type ManuscriptExtraction } from "@/lib/manuscripts/contract";

const text = "Rowan is the coordinator in this synthetic source record.";
const chunk = { id: randomUUID(), chunk_index: 0, section: "Synthetic passage", reference_text: text, content_hash: createHash("sha256").update(text).digest("hex") };
const result: ManuscriptExtraction = {
  facts: [{ category: "setting", statement: "The source lists a coordinator.", kind: "supported", spoiler: false, citations: [{ chunk_id: chunk.id, quote: "Rowan is the coordinator" }] }],
  characters: [{ name: "Rowan", aliases: [], role: "Coordinator", description: "A named coordinator in the source.", personality: "", relationships: "", arc: "", marketing_description: "", spoiler: false, citations: [{ chunk_id: chunk.id, quote: "Rowan is the coordinator" }] }],
};
const context = {
  response: { id: "synthetic-response", timestamp: new Date("2026-09-18T00:00:00Z"), modelId: "simulated-model" },
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, outputTokenDetails: { textTokens: 1, reasoningTokens: 0 } },
  finishReason: "stop" as const,
};
const output = Output.object({ schema: manuscriptModelSchema });
function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => [key, ...objectKeys(item)]);
  return [];
}

describe("provider grammar and strict local manuscript validation", () => {
  it("sends the actual SDK only the transport fields accepted by the live schema probe", async () => {
    const format = await output.responseFormat;
    expect(format).toMatchObject({ type: "json", schema: {
      type: "object", required: ["facts", "characters"], additionalProperties: false,
      properties: { facts: { type: "array", items: {
        type: "object", required: ["category", "statement", "kind", "spoiler", "citations"], additionalProperties: false,
        properties: { kind: { type: "string", enum: ["supported", "inference"] }, spoiler: { type: "boolean" }, citations: { type: "array", items: {
          type: "object", required: ["chunk_id", "quote"], additionalProperties: false,
          properties: { chunk_id: { type: "string" }, quote: { type: "string" } },
        } } },
      } } },
    } });
    expect(objectKeys(format)).not.toEqual(expect.arrayContaining(["format", "pattern", "minLength", "maxLength", "minItems", "maxItems", "$schema"]));
    for (const keyword of ["format", "pattern", "minLength", "maxLength", "minItems", "maxItems", "$schema"]) expect(objectKeys(format)).not.toContain(keyword);
    // Creating the transport must not mutate the application/SQL contract.
    expect(manuscriptExtractionSchema.safeParse({ ...result, facts: Array.from({ length: 17 }, () => result.facts[0]) }).success).toBe(false);
  });
  it("parses valid model output through the real SDK and keeps exact citation checking separate", async () => {
    const parsed = await output.parseCompleteOutput({ text: JSON.stringify(result) }, context);
    expect(validateManuscriptExtraction(parsed, [chunk])).toEqual(result);
    const foreign = structuredClone(result); foreign.facts[0].citations[0].chunk_id = randomUUID();
    const structurallyValid = await output.parseCompleteOutput({ text: JSON.stringify(foreign) }, context);
    expect(() => validateManuscriptExtraction(structurallyValid, [chunk])).toThrow(/citation/);
    const altered = structuredClone(result); altered.facts[0].citations[0].quote = "A quotation not in the source";
    expect(() => validateManuscriptExtraction(altered, [chunk])).toThrow(/citation/);
  });
  it.each([
    { name: "invalid UUID", change: (value: ManuscriptExtraction) => { value.facts[0].citations[0].chunk_id = "not-a-uuid"; } },
    { name: "too many facts", change: (value: ManuscriptExtraction) => { value.facts = Array.from({ length: 17 }, () => value.facts[0]); } },
    { name: "too many characters", change: (value: ManuscriptExtraction) => { value.characters = Array.from({ length: 9 }, () => value.characters[0]); } },
    { name: "missing citations", change: (value: ManuscriptExtraction) => { value.facts[0].citations = []; } },
    { name: "overlong quotation", change: (value: ManuscriptExtraction) => { value.facts[0].citations[0].quote = "x".repeat(301); } },
    { name: "overlong fact", change: (value: ManuscriptExtraction) => { value.facts[0].statement = "x".repeat(601); } },
    { name: "too many aliases", change: (value: ManuscriptExtraction) => { value.characters[0].aliases = Array<string>(9).fill("Synthetic alias"); } },
    { name: "overlong character detail", change: (value: ManuscriptExtraction) => { value.characters[0].description = "x".repeat(601); } },
    { name: "unexpected output field", change: (value: ManuscriptExtraction) => { Object.assign(value.facts[0], { fabricatedExtra: "private source" }); } },
  ])("still rejects $name locally despite relaxed transport", async ({ change }) => {
    const invalid = structuredClone(result); change(invalid);
    await expect(output.parseCompleteOutput({ text: JSON.stringify(invalid) }, context)).rejects.toMatchObject({ name: "AI_NoObjectGeneratedError" });
  });
});
