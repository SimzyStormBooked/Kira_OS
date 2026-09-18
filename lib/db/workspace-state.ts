import { z } from "zod";
import {
  approvalSchema,
  feedbackSchema,
  recommendationSchema,
} from "@/types/domain";
import { findings, initialApprovals, seedTime } from "@/lib/data/seed";
import { prioritizeFindings } from "@/lib/agents/raven";
export const workspaceSchema = z.object({
  version: z.literal(1),
  approvals: z.array(approvalSchema),
  feedback: z.array(feedbackSchema),
  dismissed: z.array(z.uuid()),
  recommendations: z.array(recommendationSchema),
  last_run_at: z.iso.datetime().nullable(),
});
export type DemoWorkspace = z.infer<typeof workspaceSchema>;
export function freshWorkspace(): DemoWorkspace {
  return {
    version: 1,
    approvals: structuredClone(initialApprovals),
    feedback: [],
    dismissed: [],
    recommendations: prioritizeFindings(findings, seedTime),
    last_run_at: null,
  };
}
export function parseWorkspace(raw: string) {
  return workspaceSchema.parse(JSON.parse(raw));
}

export type WorkspaceState = DemoWorkspace;
export function emptyWorkspace(): WorkspaceState {
  return {
    version: 1,
    approvals: [],
    feedback: [],
    dismissed: [],
    recommendations: [],
    last_run_at: null,
  };
}
