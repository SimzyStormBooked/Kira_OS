import { z } from "zod";

const readingSchema = z.object({
  id: z.uuid(), version: z.number().int().positive(),
  status: z.enum(["uploading", "queued", "processing", "ready", "failed"]),
  completed_chunks: z.number().int().nonnegative(), chunk_count: z.number().int().nonnegative(),
  job_state: z.enum(["queued", "running", "paused", "needs_attention", "complete"]).nullable(),
});
export const resumeBookSchema = z.object({
  id: z.uuid(), slug: z.string(), title: z.string(), updated_at: z.string(), active_manuscript_id: z.uuid().nullable(),
});
export const resumeAnswerSchema = z.object({ id: z.uuid(), title: z.string().nullable(), completed_at: z.string().nullable(), created_at: z.string() });
export const workspaceResumeSchema = z.object({
  books: resumeBookSchema.extend({ reading: readingSchema.nullable() }).array().max(2),
  answer: resumeAnswerSchema.nullable(),
});
export type WorkspaceResume = z.infer<typeof workspaceResumeSchema>;

export function resumeReadingLabel(reading: WorkspaceResume["books"][number]["reading"]) {
  if (!reading) return "No manuscript saved";
  if (reading.status === "ready") return "Knowledge ready";
  if (reading.job_state === "paused") return "Reading paused";
  if (reading.status === "failed" || reading.job_state === "needs_attention") return "Reading needs attention";
  if (reading.job_state === "running" || reading.job_state === "queued") return "Reading in the background";
  if (reading.status === "uploading") return "Upload needs to finish";
  if (reading.status === "processing") return "Check reading progress";
  return "Ready to start reading";
}
