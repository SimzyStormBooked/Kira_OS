import { z } from "zod";

export const originSchema = z.enum(["demo", "manual", "public_verified"]);
export type DataOrigin = z.infer<typeof originSchema>;
export const evidenceSchema = z.object({
  id: z.uuid(),
  source_id: z.uuid(),
  source: z.string().min(1),
  source_type: z.enum([
    "synthetic",
    "website",
    "manual_snapshot",
    "human_feedback",
  ]),
  retrieved_at: z.iso.datetime(),
  excerpt_or_metric: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  data_origin: originSchema,
});
export type Evidence = z.infer<typeof evidenceSchema>;
export interface Source {
  id: string;
  name: string;
  url: string | null;
  source_type: Evidence["source_type"];
  retrieved_at: string;
  data_origin: DataOrigin;
}
export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "WORKING" | "WAITING" | "NEEDS CASSANDRA" | "IDLE";
  mode: "deterministic" | "not_connected";
  data_origin: DataOrigin;
}
export interface AgentRun {
  id: string;
  agent_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  provider: string;
  model: string;
  input_finding_ids: string[];
  error: string | null;
  data_origin: DataOrigin;
}
export const findingSchema = z.object({
  id: z.uuid(),
  agent_id: z.uuid(),
  type: z.enum(["audience", "catalog", "tactic"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  created_at: z.iso.datetime(),
  evidence: z.array(evidenceSchema).min(1),
  source_ids: z.array(z.uuid()).min(1),
  requires_human_review: z.literal(true),
  status: z.enum(["new", "reviewed", "dismissed"]),
  data_origin: originSchema,
});
export type AgentFinding = z.infer<typeof findingSchema>;
export const recommendationSchema = z.object({
  id: z.uuid(),
  finding_id: z.uuid(),
  agent_id: z.uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  reason: z.string().min(1),
  objective: z.string().min(1),
  confidence: z.number().min(0).max(1),
  effort: z.enum(["low", "medium", "high"]),
  evidence: z.array(evidenceSchema).min(1),
  source: z.string().min(1),
  created_at: z.iso.datetime(),
  status: z.enum(["suggested", "queued", "dismissed"]),
  data_origin: originSchema,
  priority_score: z.number(),
});
export type AgentRecommendation = z.infer<typeof recommendationSchema>;
export const approvalSchema = z.object({
  id: z.uuid(),
  recommendation_id: z.uuid().nullable(),
  type: z.enum(["social", "outreach", "trope", "metadata", "seo", "campaign"]),
  title: z.string().min(1),
  description: z.string().min(1),
  draft: z.string().min(1).max(10000),
  status: z.enum(["pending", "approved", "rejected"]),
  evidence: z.array(evidenceSchema).min(1),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  data_origin: originSchema,
  version: z.number().int().nonnegative(),
});
export type ApprovalRequest = z.infer<typeof approvalSchema>;
export const feedbackSchema = z.object({
  id: z.uuid(),
  approval_request_id: z.uuid(),
  feedback: z.string().trim().min(1).max(4000),
  created_at: z.iso.datetime(),
  data_origin: z.literal("manual"),
  scope: z.literal("demo_workspace"),
});
export type HumanFeedback = z.infer<typeof feedbackSchema>;
export interface Book {
  id: string;
  slug: string;
  title: string;
  series_id: string;
  series_order: number;
  source_id: string;
  source_url: string;
  verified_at: string;
  data_origin: "public_verified";
  verification_status: "partial";
  accent: "wine" | "olive" | "blue";
  description: null;
}
export interface Series {
  id: string;
  name: string;
  source_url: string;
  data_origin: "public_verified";
  note?: string;
}
export interface Universe {
  id: string;
  name: string;
  author_id: string;
  data_origin: DataOrigin;
  description: string;
}
export interface TacticMemory {
  id: string;
  tactic: string;
  channel: string;
  objective: string;
  first_used: string;
  last_used: string;
  historical_performance: Record<string, number>;
  recent_performance: Record<string, number>;
  performance_trend: "unknown" | "up" | "flat" | "down";
  context: string;
  confidence: number;
  status: "EXPERIMENTAL" | "WORKING" | "DECLINING" | "STALE" | "RETIRED";
  data_origin: DataOrigin;
  evidence: Evidence[];
}
