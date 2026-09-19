import { z } from "zod";

export const STRATEGY_MODEL = "google/gemini-3.8-flash";
export const STRATEGY_DAILY_LIMIT = 20;
export const readerSegments = ["new_readers", "existing_fans", "ebook", "print", "audiobook", "newsletter", "book_clubs"] as const;
export const strategyModes = ["before_release", "after_release", "evergreen"] as const;
export const strategyStatuses = ["draft", "needs_review", "changes_requested", "approved", "active", "completed"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.date();
export const strategyGoalSchema = z.object({
  id: z.uuid(), label: text(120), metric: z.enum(["preorders", "sales", "reviews", "subscribers", "readers", "revenue", "custom"]),
  unit: z.enum(["count", "currency", "percent"]), target: z.number().finite().min(0).max(1e12),
  baseline: z.number().finite().min(0).max(1e12).nullable(), dueDate: date.nullable(),
}).strict();
export const strategyInputSchema = z.object({
  title: text(160), intent: text(6000), bookIds: z.array(z.uuid()).max(4), seriesId: z.uuid().nullable(),
  originApprovalId: z.uuid().nullable(), mode: z.enum(strategyModes), anchorDate: date.nullable(),
  budgetUsd: z.number().finite().min(0).max(1e7).nullable(), weeklyHours: z.number().finite().min(0).max(168).nullable(),
  segments: z.array(z.enum(readerSegments)).min(1).max(7), goals: z.array(strategyGoalSchema).max(8),
}).strict().superRefine((value, ctx) => {
  for (const [name, values] of [["bookIds", value.bookIds], ["segments", value.segments], ["goals", value.goals.map(goal => goal.id)]] as const) {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", path: [name], message: "Each item must be unique." });
  }
});
export type StrategyInput = z.infer<typeof strategyInputSchema>;
export const strategyCitationSchema = z.object({ evidence_id: text(160), quote: text(300) }).strict();
const citations = z.array(strategyCitationSchema).min(1).max(4);
export const strategyTaskDraftSchema = z.object({
  title: text(160), instructions: text(1000), channel: text(80), day_offset: z.number().int().min(-90).max(90),
  goal_ids: z.array(z.uuid()).max(8), success_measure: text(400), citations,
}).strict();
export const strategyOutputSchema = z.object({
  title: text(160), summary: text(1600), positioning: text(1000),
  audiences: z.array(z.object({ segment: z.enum(readerSegments), why: text(600), citations }).strict()).min(1).max(7),
  recommendations: z.array(z.object({ title: text(160), action: text(800), rationale: text(800), channel: text(80),
    effort: z.enum(["low", "medium", "high"]), estimated_cost_usd: z.number().finite().min(0).max(1e7),
    goal_ids: z.array(z.uuid()).max(8), citations }).strict()).min(1).max(8),
  phases: z.array(z.object({ window: z.union([z.literal(30), z.literal(60), z.literal(90)]), label: text(120), focus: text(600),
    tasks: z.array(strategyTaskDraftSchema).min(1).max(6) }).strict()).length(3),
  risks: z.array(text(500)).max(8), questions: z.array(text(300)).max(6),
}).strict();
export type StrategyOutput = z.infer<typeof strategyOutputSchema>;
export const strategyEvidenceSchema = z.object({ id: text(160), kind: z.enum(["request", "book_metadata", "manuscript", "member_input", "review"]),
  label: z.string(), text: z.string(), book_id: z.uuid().nullable(), source_id: z.uuid().nullable(), manuscript_id: z.uuid().nullable(), chunk_id: z.uuid().nullable(),
}).strict();
export type StrategyEvidence = z.infer<typeof strategyEvidenceSchema>;
export const strategySnapshotSchema = z.object({ input: strategyInputSchema, evidence: z.array(strategyEvidenceSchema), captured_at: z.string() }).strict();
export type StrategySnapshot = z.infer<typeof strategySnapshotSchema>;
export const strategyPlanSchema = z.object({
  id: z.uuid(), author_id: z.uuid(), created_by: z.uuid(), title: z.string(), input: strategyInputSchema,
  origin_approval_id: z.uuid().nullable(), origin_snapshot: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(strategyStatuses), version: z.number().int().nonnegative(), latest_revision_id: z.uuid().nullable(),
  approved_revision_id: z.uuid().nullable(), active_revision_id: z.uuid().nullable(), campaign_id: z.uuid().nullable(),
  auto_approve: z.literal(false), created_at: z.string(), updated_at: z.string(),
});
export type StrategyPlan = z.infer<typeof strategyPlanSchema>;
export const strategyUsageSchema = z.object({ inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(), gatewayGenerationId: z.string().nullable() }).strict();
export type StrategyUsage = z.infer<typeof strategyUsageSchema>;
export const strategyRevisionSchema = z.object({
  id: z.uuid(), author_id: z.uuid(), plan_id: z.uuid(), created_by: z.uuid(), revision: z.number().int().positive(), plan_version: z.number().int(),
  status: z.enum(["pending", "complete", "failed"]), input_snapshot: strategySnapshotSchema, output: strategyOutputSchema.nullable(),
  model: z.string(), usage: strategyUsageSchema.nullable(), error_code: z.string().nullable(), created_at: z.string(), completed_at: z.string().nullable(),
});
export type StrategyRevision = z.infer<typeof strategyRevisionSchema>;
export const strategyTaskSchema = z.object({ id: z.uuid(), author_id: z.uuid(), plan_id: z.uuid(), revision_id: z.uuid(), campaign_id: z.uuid(),
  phase: z.union([z.literal(30), z.literal(60), z.literal(90)]), ordinal: z.number().int(), due_date: date,
  definition: strategyTaskDraftSchema, status: z.enum(["todo", "done", "skipped"]), version: z.number().int(),
  completed_by: z.uuid().nullable(), completed_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
export type StrategyTask = z.infer<typeof strategyTaskSchema>;
export const strategyResultInputSchema = z.object({ id: z.uuid(), goalId: z.uuid(), value: z.number().finite().min(0).max(1e12), measuredAt: date, note: text(1000) }).strict();
export const strategyResultSchema = z.object({ id: z.uuid(), author_id: z.uuid(), plan_id: z.uuid(), revision_id: z.uuid(), goal_id: z.uuid(),
  value: z.number(), measured_at: date, note: z.string(), recorded_by: z.uuid(), source_type: z.literal("manual_snapshot"), created_at: z.string() });
export const strategyReviewSchema = z.object({ id: z.uuid(), author_id: z.uuid(), plan_id: z.uuid(), revision_id: z.uuid(),
  decision: z.enum(["approved", "changes_requested"]), feedback: z.string(), reviewed_by: z.uuid(), created_at: z.string() });
export function validateStrategyOutput(value: unknown, snapshot: StrategySnapshot): StrategyOutput {
  const output = strategyOutputSchema.parse(value), evidence = new Map(snapshot.evidence.map(item => [item.id, item.text]));
  const goalIds = new Set(snapshot.input.goals.map(goal => goal.id));
  const verify = (items: z.infer<typeof strategyCitationSchema>[]) => {
    if (items.some(item => !evidence.get(item.evidence_id)?.includes(item.quote))) throw new Error("Unsupported strategy citation");
  };
  for (const audience of output.audiences) { if (!snapshot.input.segments.includes(audience.segment)) throw new Error("Unknown audience"); verify(audience.citations); }
  for (const item of [...output.recommendations, ...output.phases.flatMap(phase => phase.tasks)]) {
    verify(item.citations); if (item.goal_ids.some(id => !goalIds.has(id))) throw new Error("Unknown goal");
  }
  if (new Set(output.phases.map(phase => phase.window)).size !== 3) throw new Error("All three phases are required");
  for (const phase of output.phases) for (const task of phase.tasks) {
    const offset = snapshot.input.mode === "before_release" ? -task.day_offset : task.day_offset;
    if (offset < phase.window - 29 || offset > phase.window) throw new Error("Task date is outside its phase");
  }
  return output;
}
