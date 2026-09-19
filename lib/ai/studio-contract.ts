import { z } from "zod";
import { strategyEvidenceSchema } from "@/lib/strategy/contract";

export const STUDIO_MODEL = "google/gemini-3.8-flash";
export const STUDIO_DAILY_LIMIT = 20;
export const studioJobs = ["brainstorm", "agent-design", "learning"] as const;
export type StudioJob = (typeof studioJobs)[number];
export const studioJobLabels: Record<StudioJob, string> = {
  brainstorm: "Explore a business idea", "agent-design": "Shape an agent idea", learning: "Learn something useful",
};
export const studioRequestSchema = z.object({
  id: z.uuid(), job: z.enum(studioJobs), prompt: z.string().trim().min(10).max(6000),
  bookIds: z.array(z.uuid()).max(4).optional(), includeSpoilers: z.boolean().optional(),
}).strict();
export type StudioRequest = z.infer<typeof studioRequestSchema>;
const shortText = z.string().trim().min(1).max(600);
export const studioOutputSchema = z.object({
  kind: z.enum(["ideas", "boundary"]),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(1600),
  options: z.array(z.object({
    title: z.string().trim().min(1).max(120), idea: shortText,
    tradeoff: shortText, first_step: shortText,
    verify: z.array(z.string().trim().min(1).max(300)).max(4),
  }).strict()).max(3),
  questions: z.array(z.string().trim().min(1).max(300)).max(3),
  context_used: z.array(z.string().trim().min(1).max(400)).max(4),
}).strict();
export type StudioOutput = z.infer<typeof studioOutputSchema>;
export const studioFailureCodes = ["provider_unavailable", "funding_required", "timeout", "invalid_output", "policy_blocked", "interrupted"] as const;
export type StudioFailureCode = (typeof studioFailureCodes)[number];
export const studioFailureMessages: Record<StudioFailureCode, string> = {
  provider_unavailable: "Raven could not reach the AI service. Your question is saved; try a new request later.",
  funding_required: "The AI service needs credits before Raven can answer. Your question is saved.",
  timeout: "This request took too long. Your question is saved, but no completed answer was returned.",
  invalid_output: "Raven’s answer did not pass the response checks, so it has not been shown. Your question is saved.",
  policy_blocked: "Raven helps with the business around your books. Your fiction and manuscripts stay yours to write.",
  interrupted: "This request was interrupted before a completed answer was saved. It will not restart automatically.",
};
export const studioKnowledgeSchema = z.object({book_ids:z.array(z.uuid()).max(4),include_spoilers:z.boolean(),evidence:strategyEvidenceSchema.array()});
export type StudioKnowledge = z.infer<typeof studioKnowledgeSchema>;
export const studioGenerationSchema = z.object({
  id: z.uuid(), author_id: z.uuid(), created_by: z.uuid(), job: z.enum(studioJobs),
  prompt: z.string(), model: z.literal(STUDIO_MODEL),
  status: z.enum(["pending", "complete", "failed"]), result: studioOutputSchema.nullable(),
  input_tokens: z.number().int().nonnegative().nullable(), output_tokens: z.number().int().nonnegative().nullable(),
  estimated_cost_usd: z.number().nonnegative().nullable(),
  gateway_generation_id: z.string().nullable(), error_code: z.enum(studioFailureCodes).nullable(),
  knowledge_context: studioKnowledgeSchema.default({book_ids:[],include_spoilers:false,evidence:[]}),
  created_at: z.string(), completed_at: z.string().nullable(),
});
export type StudioGeneration = z.infer<typeof studioGenerationSchema>;
export interface StudioAvailability {
  available: boolean; reason: "ready" | "disabled" | "funding" | "unavailable"; message: string;
}
export interface StudioUsage {
  inputTokens: number | null; outputTokens: number | null; estimatedCostUsd: number | null;
  gatewayGenerationId: string | null;
}
export interface StudioReply { result: StudioOutput; usage: StudioUsage }

export class StudioPolicyError extends Error {
  constructor() { super(studioFailureMessages.policy_blocked); this.name = "StudioPolicyError"; }
}
/** Early protection supplements the system policy; it is not a semantic classifier. */
export function assertStudioPrompt(prompt: string) {
  const writingRequest = /\b(write|rewrite|draft|generate|continue|finish|compose|create|make)\s+(?:(?:me|us|a|an|the|my|our|new|next|entire|whole|sample|short|first|second|opening|another|some|more|full|complete)\s+){0,6}(?:fiction|manuscript|novel|chapter|scene|fictional dialogue)\b/gi;
  for (const match of prompt.matchAll(writingRequest)) {
    const preceding = prompt.slice(Math.max(0, match.index - 80), match.index);
    if (!/\b(?:do not|don't|never)\b[^.!?\n]*$/i.test(preceding)) throw new StudioPolicyError();
  }
}
export function validateStudioOutput(value: unknown, prompt: string): StudioOutput {
  const output = studioOutputSchema.parse(value);
  if ((output.kind === "boundary" && output.options.length !== 0) || (output.kind === "ideas" && output.options.length === 0)) throw new Error("Invalid response shape");
  if (output.context_used.some((quote) => !prompt.includes(quote))) throw new Error("Unsupported context reference");
  return output;
}
/** List rates verified in the Gateway model catalog on 2026-09-17; estimates exclude cache discounts. */
export function studioUsage(input: number | undefined, output: number | undefined, gatewayId?: unknown): StudioUsage {
  const valid = (value: number | undefined) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const inputTokens = valid(input), outputTokens = valid(output);
  return {
    inputTokens, outputTokens,
    estimatedCostUsd: inputTokens === null || outputTokens === null ? null : Math.round((inputTokens * 0.00000075 + outputTokens * 0.00000375) * 1e8) / 1e8,
    gatewayGenerationId: typeof gatewayId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(gatewayId) ? gatewayId : null,
  };
}

export function studioRequestSignature(value: Pick<StudioRequest,"job"|"prompt"|"bookIds"|"includeSpoilers">) {
  return JSON.stringify({job:value.job,prompt:value.prompt.trim(),...(value.bookIds?.length?{bookIds:value.bookIds,includeSpoilers:value.includeSpoilers??false}:{})});
}
