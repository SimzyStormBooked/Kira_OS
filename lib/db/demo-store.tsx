"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { AgentRecommendation, ApprovalRequest } from "@/types/domain";
import type { WorkspaceRole } from "@/lib/auth/workspace-role";
import { agentRecipes, starterForRecipe, type AgentBlueprint, type AgentBlueprintInput, type AgentRecipeId } from "@/lib/data/agent-recipes";
import type { StudioJob } from "@/lib/ai/studio-contract";
import {
  createFeedback,
  transitionApproval,
  type ApprovalAction,
} from "@/lib/agents/approvals";
import {
  freshWorkspace,
  emptyWorkspace,
  parseWorkspace,
  workspaceSchema,
  type WorkspaceState,
} from "./workspace-state";
export {
  freshWorkspace,
  parseWorkspace,
  workspaceSchema,
} from "./workspace-state";
export type { DemoWorkspace } from "./workspace-state";
export const storageKey = "kira-os:phase-one:v1";
type Mode = "demo" | "connected";
export type BlueprintPreview = AgentBlueprint & { signature: string };
export interface LearnScratchpad {
  recipeId: AgentRecipeId;
  drafts: Record<AgentRecipeId, AgentBlueprintInput>;
  previews: Partial<Record<AgentRecipeId, BlueprintPreview>>;
  savedSignatures: Partial<Record<AgentRecipeId, string>>;
  downloadedSignatures: Partial<Record<AgentRecipeId, string>>;
}
export interface StudioScratchpad {
  job: StudioJob;
  prompt: string;
  savedSignature: string | null;
  requestIdentity: { signature: string; id: string } | null;
  submittedId: string | null;
  pendingRequestId: string | null;
}
function freshPrivateScratchpads() {
  return {
    scratchpad: { title: "", draft: "", ideaId: null as string | null },
    learnScratchpad: {
      recipeId: "brainstorm-partner" as AgentRecipeId,
      drafts: Object.fromEntries(agentRecipes.map((recipe) => [recipe.id, starterForRecipe(recipe)])) as Record<AgentRecipeId, AgentBlueprintInput>,
      previews: {}, savedSignatures: {}, downloadedSignatures: {},
    } satisfies LearnScratchpad,
    studioScratchpad: { job: "brainstorm" as StudioJob, prompt: "", savedSignature: null, requestIdentity: null, submittedId: null, pendingRequestId: null } as StudioScratchpad,
  };
}
function hasPrivateDrafts(snapshot: Snapshot) {
  const { scratchpad, learnScratchpad, studioScratchpad } = snapshot;
  const changedRecipe = agentRecipes.some((recipe) => {
    const input = learnScratchpad.drafts[recipe.id];
    const signature = JSON.stringify({ recipeId: recipe.id, input });
    return JSON.stringify(input) !== JSON.stringify(starterForRecipe(recipe)) && learnScratchpad.savedSignatures[recipe.id] !== signature && learnScratchpad.downloadedSignatures[recipe.id] !== signature;
  });
  const questionSignature = JSON.stringify({ job: studioScratchpad.job, prompt: studioScratchpad.prompt.trim() });
  return Boolean(scratchpad.title.trim() || scratchpad.draft.trim() || changedRecipe || (studioScratchpad.prompt.trim() && studioScratchpad.savedSignature !== questionSignature));
}
type Snapshot = WorkspaceState & {
  ready: boolean;
  busy: boolean;
  notice: string | null;
  error: string | null;
  mode: Mode;
  viewerEmail: string | null;
  role: WorkspaceRole;
  canEdit: boolean;
  roleError: string | null;
  scratchpad: { title: string; draft: string; ideaId: string | null };
  learnScratchpad: LearnScratchpad;
  studioScratchpad: StudioScratchpad;
};
function createStore(
  mode: Mode,
  initial: WorkspaceState,
  viewerEmail: string | null,
  initialRole: WorkspaceRole,
) {
  const role = mode === "demo" ? "owner" : initialRole;
  const server: Snapshot = {
    ...initial,
    mode,
    viewerEmail,
    role,
    canEdit: role === "owner" || role === "editor",
    roleError: null,
    ...freshPrivateScratchpads(),
    ready: mode === "connected",
    busy: false,
    notice: null,
    error: null,
  };
  let snapshot = server;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((fn) => fn());
  };
  const showError = (error: unknown) =>
    update({
      notice: null,
      error:
        error instanceof Error
          ? error.message
          : "Could not save. Please try again.",
    });
  const saveLocal = (next: WorkspaceState) => {
    const parsed = workspaceSchema.parse(next);
    localStorage.setItem(storageKey, JSON.stringify(parsed));
    return parsed;
  };
  const markRoleUnavailable = () => {
    if (snapshot.ready) update({
      canEdit: false,
      roleError: "We could not confirm your workspace permissions. Saving is paused; your unfinished notes are still here.",
    });
  };
  const readResponse = async (response: Response, isRefresh = false) => {
    if (response.status === 401 || (isRefresh && response.status === 403)) {
      update({
        ...emptyWorkspace(),
        ...freshPrivateScratchpads(),
        ready: false,
        role: "viewer", canEdit: false, roleError: null,
      });
      window.location.replace("/login");
      throw new Error("Your workspace session ended. Please sign in again.");
    }
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 403) markRoleUnavailable();
      throw new Error(
        data.error || "The workspace is unavailable. Please try again.",
      );
    }
    const workspace = workspaceSchema.parse(data);
    const roleHeader = response.headers.get("x-kira-workspace-role");
    if (roleHeader === "owner" || roleHeader === "editor" || roleHeader === "viewer") {
      update({ role: roleHeader, canEdit: roleHeader !== "viewer", roleError: null });
    } else markRoleUnavailable();
    return workspace;
  };
  async function refresh() {
    if (snapshot.busy) return;
    if (mode === "demo") {
      try {
        const raw = localStorage.getItem(storageKey);
        update({
          ...(raw ? parseWorkspace(raw) : freshWorkspace()),
          ready: true,
        });
      } catch {
        showError(
          new Error(
            "Browser storage is unavailable or contains an incompatible workspace. Export any existing data before resetting.",
          ),
        );
        update({ ready: true });
      }
    } else {
      update({ busy: true });
      try {
        update({
          ...await readResponse(
            await fetch("/api/workspace", { cache: "no-store" }),
            true,
          ),
          error: null,
        });
      } catch (error) {
        markRoleUnavailable();
        showError(error);
      } finally {
        update({ busy: false });
      }
    }
  }
  async function perform(
    body: Record<string, unknown>,
    local: () => WorkspaceState,
    notice: string,
  ): Promise<boolean> {
    if (snapshot.busy) return false;
    if (!snapshot.canEdit) {
      showError(new Error(snapshot.roleError ?? "You have viewer access. An owner or editor can save changes; you can still read and export the workspace."));
      return false;
    }
    update({ busy: true, error: null, notice: null });
    try {
      const next =
        mode === "connected"
          ? await readResponse(
              await fetch("/api/workspace", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }),
            )
          : saveLocal(local());
      update({ ...next, notice, ready: true });
      return true;
    } catch (error) {
      // Reconcile stale versions after a rejected concurrent change; never substitute demo state.
      if (mode === "connected") {
        try {
          update(
            await readResponse(
              await fetch("/api/workspace", { cache: "no-store" }),
              true,
            ),
          );
        } catch {
          markRoleUnavailable();
        }
      }
      showError(error);
      return false;
    } finally {
      update({ busy: false });
    }
  }
  const actions = {
    showError,
    hasUnsavedPrivateDrafts: () => hasPrivateDrafts(snapshot),
    clearPrivateScratchpads: () => update(freshPrivateScratchpads()),
    updateLearnScratchpad: (change: (previous: LearnScratchpad) => LearnScratchpad) => update({ learnScratchpad: change(snapshot.learnScratchpad) }),
    updateStudioScratchpad: (patch: Partial<StudioScratchpad>) => update({ studioScratchpad: { ...snapshot.studioScratchpad, ...patch } }),
    markStudioQuestionSaved: (id: string, signature: string) => {
      if (snapshot.studioScratchpad.requestIdentity?.id === id) update({ studioScratchpad: { ...snapshot.studioScratchpad, savedSignature: signature } });
    },
    finishStudioRequest: (id: string) => {
      if (snapshot.studioScratchpad.pendingRequestId === id) update({ studioScratchpad: { ...snapshot.studioScratchpad, pendingRequestId: null } });
    },
    updateScratchpad: (patch: Partial<Snapshot["scratchpad"]>) =>
      update({ scratchpad: { ...snapshot.scratchpad, ...patch } }),
    clearScratchpad: (submitted?: Snapshot["scratchpad"]) => {
      // A completed save must never erase words entered after that submission.
      if (submitted && snapshot.scratchpad !== submitted) return;
      update({ scratchpad: { title: "", draft: "", ideaId: null } });
    },
    dismissNotice: () => update({ notice: null, error: null }),
    refresh,
    decideApproval: (id: string, action: ApprovalAction, version: number) =>
      perform(
        { action: "decide", id, decision: action, version },
        () => {
          const current = snapshot.approvals.find((a) => a.id === id);
          if (!current) throw new Error("Approval request not found");
          const updated = transitionApproval(
            current,
            action,
            new Date().toISOString(),
            version,
          );
          return {
            ...snapshot,
            approvals: snapshot.approvals.map((a) =>
              a.id === id ? updated : a,
            ),
          };
        },
        action.type === "edit"
          ? "Draft saved. It still needs your approval."
          : action.type === "approve"
            ? "Approval recorded. Nothing has been published or sent."
            : "Rejected. Your decision is saved.",
      ),
    teachRaven: (id: string, text: string) =>
      perform(
        { action: "teach", id, text },
        () => {
          const request = snapshot.approvals.find((a) => a.id === id);
          if (!request) throw new Error("Approval request not found");
          return {
            ...snapshot,
            feedback: [
              ...snapshot.feedback,
              createFeedback(
                request,
                text,
                new Date().toISOString(),
                crypto.randomUUID(),
              ),
            ],
          };
        },
        mode === "demo"
          ? "Lesson saved to your local memory. Future agent runs can use it; demo ranking is unchanged."
          : "Lesson saved to your private workspace for future use. No model was retrained.",
      ),
    queueRecommendation: (rec: AgentRecommendation) =>
      perform(
        { action: "queue", id: rec.id },
        () => {
          if (snapshot.approvals.some((a) => a.recommendation_id === rec.id))
            return snapshot;
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
          return {
            ...snapshot,
            approvals: [...snapshot.approvals, approval],
            dismissed: snapshot.dismissed.filter((id) => id !== rec.id),
          };
        },
        "Campaign brief prepared at Cassandra’s Desk.",
      ),
    dismissRecommendation: (id: string) =>
      perform(
        { action: "dismiss", id },
        () => ({
          ...snapshot,
          dismissed: [...new Set([...snapshot.dismissed, id])],
        }),
        "Set aside. Restore it from The Raven whenever you’re ready.",
      ),
    restoreRecommendations: () =>
      perform(
        { action: "restore" },
        () => ({ ...snapshot, dismissed: [] }),
        "Recommendations restored.",
      ),
    saveRavenRun: (recommendations: AgentRecommendation[], at: string) => {
      if (mode !== "demo")
        throw new Error("Demo runs cannot be saved to a private workspace.");
      update({
        ...saveLocal({ ...snapshot, recommendations, last_run_at: at }),
        notice:
          "Demo briefing refreshed from 3 seeded findings. No live sources were queried.",
      });
    },
    resetWorkspace: () => {
      if (mode !== "demo")
        throw new Error("Private workspaces cannot be reset here.");
      update({
        ...saveLocal(freshWorkspace()),
        notice: "Local demo workspace reset.",
      });
    },
    createManualReview: (title: string, draft: string) =>
      perform(
        { action: "create", title, draft },
        () => {
          if (
            !title.trim() ||
            title.trim().length > 200 ||
            !draft.trim() ||
            draft.trim().length > 10000
          )
            throw new Error("Add a title and a brief within the field limits.");
          const now = new Date().toISOString();
          const approval: ApprovalRequest = {
            id: crypto.randomUUID(),
            recommendation_id: null,
            type: "campaign",
            title: title.trim(),
            description:
              "Your business idea, saved for review. No external action is authorized.",
            draft: draft.trim(),
            status: "pending",
            created_at: now,
            updated_at: now,
            version: 0,
            data_origin: "manual",
            evidence: [
              {
                id: crypto.randomUUID(),
                source_id: crypto.randomUUID(),
                source: "Your original business brief",
                source_type: "human_feedback",
                retrieved_at: now,
                excerpt_or_metric: draft.trim(),
                metadata: { scope: "demo_workspace" },
                data_origin: "manual",
              },
            ],
          };
          return { ...snapshot, approvals: [...snapshot.approvals, approval] };
        },
        mode === "demo"
          ? "Your brief is saved in this browser at Cassandra’s Desk."
          : "Your brief is saved at Cassandra’s Desk.",
      ),
    exportWorkspace: () => {
      const blob = new Blob(
        [JSON.stringify(workspaceSchema.parse(snapshot), null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        mode === "demo"
          ? "kira-os-demo-workspace.json"
          : "kira-os-workspace.json";
      link.click();
      URL.revokeObjectURL(url);
    },
  };
  return {
    actions,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => server,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
const WorkspaceContext = createContext<ReturnType<typeof createStore> | null>(
  null,
);
export function WorkspaceProvider(props: WorkspaceProviderProps) {
  // A different signed-in account must never inherit private in-memory notes.
  return <WorkspaceSessionProvider key={`${props.mode}:${props.viewerEmail ?? "demo"}`} {...props} />;
}
type WorkspaceProviderProps = {
  mode: Mode;
  initialWorkspace: WorkspaceState;
  viewerEmail?: string | null;
  role?: WorkspaceRole;
  children: React.ReactNode;
};
function WorkspaceSessionProvider({
  mode,
  initialWorkspace,
  viewerEmail = null,
  role = mode === "demo" ? "owner" : "viewer",
  children,
}: WorkspaceProviderProps) {
  const [store] = useState(() =>
    createStore(mode, initialWorkspace, viewerEmail, role),
  );
  useEffect(() => {
    if (mode === "demo") void store.actions.refresh();
    const storage = (event: StorageEvent) => {
      if (mode === "demo" && event.key === storageKey)
        void store.actions.refresh();
    };
    const focus = () => {
      void store.actions.refresh();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasPrivateDrafts(store.getSnapshot())) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
    };
  }, [store, mode]);
  return (
    <WorkspaceContext.Provider value={store}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error("Workspace provider is missing");
  return {
    ...useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    ),
    ...store.actions,
  };
}
