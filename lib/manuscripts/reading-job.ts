import { z } from "zod";
export const readingJobSchema = z.object({
  id: z.uuid(), manuscript_id: z.uuid(), state: z.enum(["queued", "running", "paused", "needs_attention", "complete"]),
  error_code: z.string().nullable(), updated_at: z.string(),
});
export type ReadingJob = z.infer<typeof readingJobSchema>;
