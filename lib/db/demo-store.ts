"use client";
import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import {
  approvalSchema,
  feedbackSchema,
  recommendationSchema,
  type AgentRecommendation,
  type ApprovalRequest,
} from "@/types/domain";
import { findings, initialApprovals, seedTime } from "@/lib/data/seed";
import { prioritizeFindings } from "@/lib/agents/raven";
import {
  createFeedback,
  transitionApproval,
  type ApprovalAction,
} from "@/lib/agents/approvals";

export const storageKey = "kira-os:phase-one:v1";
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
type Snapshot = DemoWorkspace & {
  ready: boolean;
  notice: string | null;
  error: string | null;
};
const serverSnapshot: Snapshot = {
  ...freshWorkspace(),
  ready: false,
  notice: null,
  error: null,
};
let snapshot: Snapshot = serverSnapshot;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;
export function hydrateWorkspace() {
  try {
    const raw = localStorage.getItem(storageKey);
    snapshot = {
      ...(raw ? parseWorkspace(raw) : freshWorkspace()),
      ready: true,
      notice: null,
      error: null,
    };
  } catch {
    snapshot = {
      ...freshWorkspace(),
      ready: true,
      notice: null,
      error:
        "Browser storage is unavailable or contains an incompatible workspace. Export any existing data before resetting.",
    };
  }
  emit();
}
export function useWorkspace() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!snapshot.ready) hydrateWorkspace();
    const listener = (event: StorageEvent) => {
      if (event.key === storageKey) hydrateWorkspace();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  return state;
}
function save(next: DemoWorkspace, notice: string) {
  const parsed = workspaceSchema.parse(next);
  try {
    localStorage.setItem(storageKey, JSON.stringify(parsed));
  } catch {
    throw new Error(
      "Could not save to this browser. Check storage permissions before trying again.",
    );
  }
  snapshot = { ...parsed, ready: true, notice, error: null };
  emit();
}
export function dismissNotice() {
  snapshot = { ...snapshot, notice: null, error: null };
  emit();
}
export function showError(error: unknown) {
  snapshot = {
    ...snapshot,
    notice: null,
    error:
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.",
  };
  emit();
}
export function decideApproval(
  id: string,
  action: ApprovalAction,
  version: number,
) {
  const current = snapshot.approvals.find((a) => a.id === id);
  if (!current) throw new Error("Approval request not found");
  const updated = transitionApproval(
    current,
    action,
    new Date().toISOString(),
    version,
  );
  save(
    {
      ...snapshot,
      approvals: snapshot.approvals.map((a) => (a.id === id ? updated : a)),
    },
    action.type === "edit"
      ? "Draft saved. It still needs your approval."
      : action.type === "approve"
        ? "Approval recorded. Nothing has been published or sent."
        : "Rejected. Your decision is saved.",
  );
}
export function teachRaven(id: string, text: string) {
  const request = snapshot.approvals.find((a) => a.id === id);
  if (!request) throw new Error("Approval request not found");
  const feedback = createFeedback(
    request,
    text,
    new Date().toISOString(),
    crypto.randomUUID(),
  );
  save(
    { ...snapshot, feedback: [...snapshot.feedback, feedback] },
    "Lesson saved to your local memory. Future agent runs can use it; demo ranking is unchanged.",
  );
}
export function queueRecommendation(rec: AgentRecommendation) {
  if (snapshot.approvals.some((a) => a.recommendation_id === rec.id)) return;
  const now = new Date().toISOString();
  const approval: ApprovalRequest = {
    id: crypto.randomUUID(),
    recommendation_id: rec.id,
    type: "campaign",
    title: rec.title,
    description: rec.description,
    draft: `DEMO CAMPAIGN BRIEF\n\nObjective: ${rec.objective}\n\nDirection: ${rec.description}\n\nWhy: ${rec.reason}\n\nNext: Cassandra verifies book relevance and audience fit, then selects approved assets. This brief authorizes no external action.`,
    status: "pending",
    evidence: rec.evidence,
    created_at: now,
    updated_at: now,
    data_origin: "demo",
    version: 0,
  };
  save(
    {
      ...snapshot,
      approvals: [...snapshot.approvals, approval],
      dismissed: snapshot.dismissed.filter((id) => id !== rec.id),
    },
    "Campaign brief prepared at Cassandra’s Desk.",
  );
}
export function dismissRecommendation(id: string) {
  save(
    { ...snapshot, dismissed: [...new Set([...snapshot.dismissed, id])] },
    "Set aside. Restore it from The Raven whenever you’re ready.",
  );
}
export function restoreRecommendations() {
  save({ ...snapshot, dismissed: [] }, "Recommendations restored.");
}
export function saveRavenRun(
  recommendations: AgentRecommendation[],
  at: string,
) {
  save(
    { ...snapshot, recommendations, last_run_at: at },
    "Demo briefing refreshed from 3 seeded findings. No live sources were queried.",
  );
}
export function resetWorkspace() {
  save(freshWorkspace(), "Local demo workspace reset.");
}
export function exportWorkspace() {
  const blob = new Blob(
    [JSON.stringify(workspaceSchema.parse(snapshot), null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kira-os-demo-workspace.json";
  link.click();
  URL.revokeObjectURL(url);
}
