import "server-only";
import { assertCapability, type Capability } from "./policy";
import type { AgentFinding, AgentRecommendation } from "@/types/domain";
import { recommendationSchema } from "@/types/domain";
import { validateFinding } from "@/lib/knowledge/provenance";
import type { ModelConfig } from "./models";
import { assertStudioPrompt, studioRequestSchema, type StudioRequest } from "./studio-contract";
import { generateStudioReply } from "./studio-provider";
import { generateManuscriptExtraction } from "@/lib/manuscripts/provider";
import type { ManuscriptChunk } from "@/lib/manuscripts/contract";

/** Permission here is resolved from a sealed database batch, never a browser flag. */
export async function runManuscriptExtraction(chunks: ManuscriptChunk[], context: { sourceApproved: boolean }) {
  assertCapability("ALLOW_APPROVED_CONTENT_REPURPOSING", context);
  return generateManuscriptExtraction(chunks);
}

/** On-demand thinking uses the same creative-policy boundary as other providers. */
export async function runStudioProvider(input: StudioRequest, knowledge?: import("./studio-contract").StudioKnowledge) {
  assertCapability("ALLOW_MARKETING_ANALYSIS");
  const request = studioRequestSchema.parse(input);
  assertStudioPrompt(request.prompt);
  return generateStudioReply(request, knowledge);
}
export interface IntelligenceProvider {
  readonly config: ModelConfig;
  synthesize(
    findings: AgentFinding[],
    at: string,
  ): Promise<AgentRecommendation[]>;
}
/** All future model adapters run behind this server-only policy boundary. */
export async function runProvider(
  provider: IntelligenceProvider,
  input: {
    capability: Capability;
    findings: AgentFinding[];
    at: string;
    sourceApproved?: boolean;
  },
) {
  assertCapability(input.capability, { sourceApproved: input.sourceApproved });
  const findings = input.findings.map(validateFinding);
  const recommendations = recommendationSchema
    .array()
    .parse(await provider.synthesize(findings, input.at));
  for (const recommendation of recommendations) {
    const finding = findings.find((f) => f.id === recommendation.finding_id);
    if (!finding) throw new Error("Provider referenced an unknown finding");
    for (const item of recommendation.evidence) {
      const original = finding.evidence.find((e) => e.id === item.id);
      if (
        !original ||
        original.source_id !== item.source_id ||
        original.source_type !== item.source_type ||
        original.source !== item.source ||
        original.excerpt_or_metric !== item.excerpt_or_metric ||
        original.retrieved_at !== item.retrieved_at ||
        original.data_origin !== item.data_origin ||
        JSON.stringify(original.metadata) !== JSON.stringify(item.metadata)
      ) {
        throw new Error("Provider must preserve supporting source evidence");
      }
    }
    if (
      (finding.data_origin === "demo" ||
        recommendation.evidence.some((e) => e.data_origin === "demo")) &&
      recommendation.data_origin !== "demo"
    ) {
      throw new Error("Provider cannot relabel demo intelligence");
    }
  }
  return recommendations;
}

export async function runStrategyProvider(snapshot: import("@/lib/strategy/contract").StrategySnapshot) {
  assertCapability("ALLOW_MARKETING_ANALYSIS");
  assertStudioPrompt(snapshot.input.intent);
  const { generateStrategy } = await import("@/lib/strategy/provider");
  return generateStrategy(snapshot);
}
