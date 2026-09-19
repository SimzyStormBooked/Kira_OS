import "server-only";
import { jsonSchema } from "ai";
import type { JSONSchema7 } from "@ai-sdk/provider";
import { z } from "zod";
import { manuscriptExtractionSchema, type ManuscriptExtraction } from "./contract";

// Google/Vertex reject the combination of nested constrained arrays and string
// formats in this schema. Relax only the provider grammar, never local acceptance.
const localOnlyKeywords = new Set(["format", "pattern", "minLength", "maxLength", "minItems", "maxItems", "$schema"]);
function simplifyTransport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(simplifyTransport);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([key]) => !localOnlyKeywords.has(key)).map(([key, item]) => [key, simplifyTransport(item)]),
  );
  return value;
}

export function compatibleModelSchema<T>(schema: z.ZodType<T>) {
  return jsonSchema<T>(simplifyTransport(z.toJSONSchema(schema, { target: "draft-7", io: "input", reused: "inline" })) as JSONSchema7, {
    validate(value) { const parsed = schema.safeParse(value); return parsed.success ? { success: true, value: parsed.data } : { success: false, error: parsed.error }; },
  });
}
export const manuscriptModelSchema = compatibleModelSchema<ManuscriptExtraction>(manuscriptExtractionSchema);
