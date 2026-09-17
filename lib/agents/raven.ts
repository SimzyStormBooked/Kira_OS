import { validateFinding } from "@/lib/knowledge/provenance";
import { assertCapability } from "@/lib/ai/policy";
import { seedId } from "@/lib/data/seed";
import type { AgentFinding, AgentRecommendation } from "@/types/domain";
const playbooks = {
  audience: {
    title: "Explore the devotion signal",
    objective: "Understand reader fit",
    effort: "low",
    weight: 90,
    reason:
      "Language patterns can inform positioning after audience fit and book relevance are verified.",
  },
  catalog: {
    title: "Make the catalog canonical",
    objective: "Improve metadata confidence",
    effort: "low",
    weight: 75,
    reason: "Reliable marketing starts with confirmed book information.",
  },
  tactic: {
    title: "Give the backlist a fresh look",
    objective: "Review marketing freshness",
    effort: "medium",
    weight: 65,
    reason: "A recurring asset review helps prevent stale marketing habits.",
  },
} as const;
/** Deterministic, inspectable ranking. Scores indicate review priority, never predicted ROI. */
export function prioritizeFindings(
  inputs: AgentFinding[],
  at: string,
): AgentRecommendation[] {
  assertCapability("ALLOW_MARKETING_ANALYSIS");
  const now = Date.parse(at);
  if (!Number.isFinite(now))
    throw new Error("A valid evaluation timestamp is required");
  return inputs
    .map(validateFinding)
    .filter((f) => f.status === "new")
    .map((f) => {
      const rule = playbooks[f.type];
      const oldest = Math.min(
        ...f.evidence.map((e) => Date.parse(e.retrieved_at)),
      );
      const ageDays = Math.max(0, (now - oldest) / 86400000);
      const freshness = Math.max(0.25, 1 - ageDays / 120);
      return {
        id: f.id,
        finding_id: f.id,
        agent_id: seedId(30),
        title: rule.title,
        description: f.summary,
        reason: rule.reason,
        objective: rule.objective,
        confidence: f.confidence,
        effort: rule.effort,
        evidence: f.evidence,
        source: "Raven · deterministic demo synthesis",
        created_at: at,
        status: "suggested" as const,
        data_origin: "demo" as const,
        priority_score: Math.round(rule.weight * f.confidence * freshness),
      };
    })
    .sort(
      (a, b) => b.priority_score - a.priority_score || a.id.localeCompare(b.id),
    );
}
