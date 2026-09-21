"use client";
import { z } from "zod";
import { studioJobs, studioRequestSignature } from "@/lib/ai/studio-contract";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { AgentRecommendation, ApprovalRequest } from "@/types/domain";
import type { WorkspaceRole } from "@/lib/auth/workspace-role";
import { agentRecipeIds, agentRecipes, starterForRecipe, type AgentBlueprint, type AgentBlueprintInput, type AgentRecipeId } from "@/lib/data/agent-recipes";
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
  bookIds: string[];
  includeSpoilers: boolean;
  job: StudioJob;
  prompt: string;
  savedSignature: string | null;
  requestIdentity: { signature: string; id: string } | null;
  submittedId: string | null;
  pendingRequestId: string | null;
}
const recipeIdSchema = z.enum(agentRecipeIds);
const blueprintDraftSchema = z.object({ name: z.string().max(80), goal: z.string().max(1000), context: z.string().max(3000), success: z.string().max(1000) });
const blueprintPreviewSchema = z.object({ title: z.string().max(400), prompt: z.string().max(20000), brief: z.string().max(20000), signature: z.string().max(40000) });
/** Unfinished words she has not saved. Kept per tab so a reload cannot take them, never sent anywhere. */
const privateDraftsSchema = z.object({
  scratchpad: z.object({ title: z.string().max(200), draft: z.string().max(10000), ideaId: z.string().max(120).nullable() }),
  learnScratchpad: z.object({
    recipeId: recipeIdSchema,
    drafts: z.partialRecord(recipeIdSchema, blueprintDraftSchema),
    previews: z.partialRecord(recipeIdSchema, blueprintPreviewSchema),
    savedSignatures: z.partialRecord(recipeIdSchema, z.string().max(40000)),
    downloadedSignatures: z.partialRecord(recipeIdSchema, z.string().max(40000)),
  }),
  studioScratchpad: z.object({
    bookIds: z.array(z.uuid()).max(4), includeSpoilers: z.boolean(), job: z.enum(studioJobs), prompt: z.string().max(6000),
    savedSignature: z.string().max(40000).nullable(),
    requestIdentity: z.object({ signature: z.string().max(40000), id: z.uuid() }).nullable(),
    submittedId: z.uuid().nullable(), pendingRequestId: z.uuid().nullable(),
  }),
  editDrafts: z.record(z.string().max(120), z.string().max(10000)),
});
const draftsStorageKey = (mode: Mode, viewerEmail: string | null) => `kira-os:drafts:v1:${mode}:${viewerEmail ?? "demo"}`;
function restoreDrafts(key: string): { drafts: PrivateScratchpads; unreadable: string | null } {
  const fresh = freshPrivateScratchpads();
  let raw: string | null = null;
  try {
    raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
    if (!raw) return { drafts: fresh, unreadable: null };
    const stored = privateDraftsSchema.parse(JSON.parse(raw));
    return {
      drafts: {
        scratchpad: stored.scratchpad,
        learnScratchpad: { ...stored.learnScratchpad, drafts: { ...fresh.learnScratchpad.drafts, ...stored.learnScratchpad.drafts } },
        studioScratchpad: stored.studioScratchpad,
        editDrafts: stored.editDrafts,
      },
      unreadable: null,
    };
  } catch {
    // Words this version cannot read are never dropped behind her back: the raw text is
    // handed back in a dialog so she can copy or download it before anything replaces it.
    return { drafts: fresh, unreadable: raw };
  }
}
/** Returns false when this browser refused the write, so the UI can stop promising the draft is kept. */
function persistDrafts(key: string, snapshot: Snapshot) {
  try {
    if (typeof sessionStorage === "undefined") return true;
    sessionStorage.setItem(key, JSON.stringify({
      scratchpad: snapshot.scratchpad, learnScratchpad: snapshot.learnScratchpad,
      studioScratchpad: snapshot.studioScratchpad, editDrafts: snapshot.editDrafts,
    }));
    return true;
  } catch {
    return false;
  }
}
function forgetDrafts(key: string) {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    // Nothing to do; the scratchpads are cleared in memory either way.
  }
}
function downloadFile(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
type PrivateScratchpads = ReturnType<typeof freshPrivateScratchpads>;
function freshPrivateScratchpads() {
  return {
    scratchpad: { title: "", draft: "", ideaId: null as string | null },
    learnScratchpad: {
      recipeId: "brainstorm-partner" as AgentRecipeId,
      drafts: Object.fromEntries(agentRecipes.map((recipe) => [recipe.id, starterForRecipe(recipe)])) as Record<AgentRecipeId, AgentBlueprintInput>,
      previews: {}, savedSignatures: {}, downloadedSignatures: {},
    } satisfies LearnScratchpad,
    studioScratchpad: { bookIds: [], includeSpoilers: false, job: "brainstorm" as StudioJob, prompt: "", savedSignature: null, requestIdentity: null, submittedId: null, pendingRequestId: null } as StudioScratchpad,
    editDrafts: {} as Record<string, string>,
  };
}
export function editDraftKey(id: string, version: number) {
  return `${id}:${version}`;
}
/** Her unsaved rewrite of one brief: the text she typed, and the draft number she typed it against. */
export function keptEditFor(
  editDrafts: Record<string, string>,
  approval: { id: string; version: number; draft: string },
): [text: string | null, unsaved: string | null, version: number] {
  const own = Object.entries(editDrafts).find(([key]) => key.startsWith(`${approval.id}:`));
  if (!own) return [null, null, approval.version];
  const [key, text] = own;
  return [text, text.trim() === approval.draft.trim() ? null : text, Number(key.slice(approval.id.length + 1))];
}
function hasPrivateDrafts(snapshot: Snapshot) {
  const { scratchpad, learnScratchpad, studioScratchpad } = snapshot;
  const changedRecipe = agentRecipes.some((recipe) => {
    const input = learnScratchpad.drafts[recipe.id];
    const signature = JSON.stringify({ recipeId: recipe.id, input });
    return JSON.stringify(input) !== JSON.stringify(starterForRecipe(recipe)) && learnScratchpad.savedSignatures[recipe.id] !== signature && learnScratchpad.downloadedSignatures[recipe.id] !== signature;
  });
  const questionSignature = studioRequestSignature(studioScratchpad);
  // An edited brief counts while her text still differs from the brief as it stands now.
  const editedBrief = snapshot.approvals.some((approval) => keptEditFor(snapshot.editDrafts, approval)[1] !== null);
  return Boolean(scratchpad.title.trim() || scratchpad.draft.trim() || changedRecipe || editedBrief || (studioScratchpad.prompt.trim() && studioScratchpad.savedSignature !== questionSignature));
}
/**
 * A long-text field anywhere in the app can register itself here so the draft guard,
 * the reload warning, the sign-out confirmation and the session-ended dialog all see it.
 * The text is read on demand and never persisted; the registry lives in one workspace
 * store instance, never in a process-wide singleton.
 */
export type KeptDraft = { key: string; label: string; text: string };
type DraftRegistration = { label: string; getText: () => string };
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
  editDrafts: Record<string, string>;
  sessionEnded: boolean;
  corruptWorkspace: string | null;
  /** True once this browser has refused to hold a draft, so no screen keeps promising it is kept. */
  draftStorageFailed: boolean;
  /** Stored draft text this version could not read, kept verbatim until she decides. */
  unreadableDrafts: string | null;
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
    sessionEnded: false,
    corruptWorkspace: null,
    draftStorageFailed: false,
    unreadableDrafts: null,
  };
  const draftsKey = draftsStorageKey(mode, viewerEmail);
  const restored = restoreDrafts(draftsKey);
  let snapshot: Snapshot = { ...server, ...restored.drafts, unreadableDrafts: restored.unreadable };
  const registeredDrafts = new Map<string, DraftRegistration>();
  const keptRegisteredDrafts = (): KeptDraft[] => {
    const kept: KeptDraft[] = [];
    for (const [key, entry] of registeredDrafts) {
      let text = "";
      try {
        text = entry.getText();
      } catch {
        // A field that cannot report its text must not break the rescue path for the others.
        continue;
      }
      if (text.trim()) kept.push({ key, label: entry.label, text });
    }
    return kept;
  };
  const hasAnyPrivateDrafts = () => hasPrivateDrafts(snapshot) || keptRegisteredDrafts().length > 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    if (
      ("scratchpad" in patch || "learnScratchpad" in patch || "studioScratchpad" in patch || "editDrafts" in patch) &&
      // Never write over stored text she has not been offered back yet.
      snapshot.unreadableDrafts === null
    ) {
      // A refused write is surfaced, not swallowed: the hints stop claiming the draft is kept.
      if (!persistDrafts(draftsKey, snapshot) && !snapshot.draftStorageFailed)
        snapshot = { ...snapshot, draftStorageFailed: true };
    }
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
    if (snapshot.corruptWorkspace !== null)
      throw new Error("This browser still holds a demo workspace this version cannot read. Download it or start a fresh demo workspace first.");
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
  /** Unfinished words are never thrown away by a background session loss; she decides when they go. */
  const endSession = () => {
    if (hasAnyPrivateDrafts()) {
      update({ sessionEnded: true, ready: false, busy: false });
      return true;
    }
    update({
      ...emptyWorkspace(),
      ...freshPrivateScratchpads(),
      ready: false,
      role: "viewer", canEdit: false, roleError: null,
    });
    forgetDrafts(draftsKey);
    window.location.replace("/login");
    return false;
  };
  const readResponse = async (response: Response, isRefresh = false) => {
    if (response.status === 401 || (isRefresh && response.status === 403)) {
      throw new Error(endSession()
        ? "Your workspace session ended. Your unfinished notes are in the dialog; copy anything you want to keep."
        : "Your workspace session ended. Please sign in again.");
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
    // A session already known to be over must not keep retrying behind her dialog.
    if (snapshot.busy || snapshot.sessionEnded) return;
    if (mode === "demo") {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(storageKey);
      } catch {
        update({ ...freshWorkspace(), ready: true });
        showError(new Error("This browser blocks local storage, so the demo cannot keep your changes. Nothing you saved elsewhere is affected."));
        return;
      }
      try {
        update({
          ...(raw ? parseWorkspace(raw) : freshWorkspace()),
          ready: true,
          corruptWorkspace: null,
        });
      } catch {
        // Her old file is kept exactly as it is until she chooses what to do with it.
        update({ ...freshWorkspace(), ready: true, corruptWorkspace: raw });
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
    endSession,
    hasUnsavedPrivateDrafts: () => hasAnyPrivateDrafts(),
    /** Any long-text field can join the draft guard; the text is read only when it is needed. */
    registerDraft: (key: string, label: string, getText: () => string) => {
      registeredDrafts.set(key, { label, getText });
    },
    releaseDraft: (key: string) => {
      registeredDrafts.delete(key);
    },
    keptRegisteredDrafts,
    downloadUnreadableDrafts: () => {
      if (snapshot.unreadableDrafts !== null) downloadFile(snapshot.unreadableDrafts, "kira-os-unreadable-drafts.txt");
    },
    dismissUnreadableDrafts: () => {
      if (snapshot.unreadableDrafts === null) return;
      forgetDrafts(draftsKey);
      update({ unreadableDrafts: null });
    },
    clearPrivateScratchpads: () => {
      update({ ...freshPrivateScratchpads(), draftStorageFailed: false });
      forgetDrafts(draftsKey);
    },
    leaveEndedSession: () => {
      update({ ...freshPrivateScratchpads(), sessionEnded: false, draftStorageFailed: false });
      forgetDrafts(draftsKey);
      window.location.replace("/login");
    },
    // One kept rewrite per brief: a newer draft number replaces the older entry rather than orphaning it.
    setEditDraft: (id: string, version: number, draft: string | null) => {
      const next = Object.fromEntries(Object.entries(snapshot.editDrafts).filter(([key]) => !key.startsWith(`${id}:`)));
      if (draft !== null) next[editDraftKey(id, version)] = draft;
      update({ editDrafts: next });
    },
    clearEditDrafts: (id: string) =>
      update({ editDrafts: Object.fromEntries(Object.entries(snapshot.editDrafts).filter(([key]) => !key.startsWith(`${id}:`))) }),
    downloadCorruptWorkspace: () => {
      if (snapshot.corruptWorkspace !== null) downloadFile(snapshot.corruptWorkspace, "kira-os-unreadable-workspace.json");
    },
    startFreshDemoWorkspace: () => {
      if (mode !== "demo") throw new Error("Private workspaces cannot be reset here.");
      update({ corruptWorkspace: null });
      update({ ...saveLocal(freshWorkspace()), notice: "A fresh demo workspace is ready in this browser." });
    },
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
            draft: `DEMO CAMPAIGN BRIEF\n\nObjective: ${rec.objective}\n\nDirection: ${rec.description}\n\nWhy: ${rec.reason}\n\nNext: confirm book relevance and audience fit yourself, then choose approved assets. This brief authorizes no external action.`,
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
    exportWorkspace: () =>
      downloadFile(
        JSON.stringify(workspaceSchema.parse(snapshot), null, 2),
        mode === "demo" ? "kira-os-demo-workspace.json" : "kira-os-workspace.json",
      ),
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
      if (store.actions.hasUnsavedPrivateDrafts()) {
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
/**
 * Join the draft guard from any unsaved long-text field, wherever it lives.
 * Pass the text while it is unsaved and an empty string once it is saved or empty.
 * Nothing here is persisted or sent; it only makes sure the reload warning, the
 * sign-out confirmation and the session-ended dialog know the words exist.
 */
export function useRegisteredDraft(key: string, label: string, text: string) {
  const { registerDraft, releaseDraft } = useWorkspace();
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  }, [text]);
  useEffect(() => {
    registerDraft(key, label, () => latest.current);
    return () => releaseDraft(key);
  }, [key, label, registerDraft, releaseDraft]);
}
