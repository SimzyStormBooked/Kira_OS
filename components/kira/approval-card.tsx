"use client";
import { useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCheck,
  Lightbulb,
  PencilLine,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { keptEditFor, useWorkspace } from "@/lib/db/demo-store";
import type { ApprovalRequest } from "@/types/domain";
import { DemoBadge } from "./origin-badge";
import { EvidenceDrawer } from "./evidence-drawer";
import "./desk.css";
const statusLabels: Record<ApprovalRequest["status"], string> = {
  pending: "Waiting for you",
  approved: "Approved",
  rejected: "Rejected",
};
export function ApprovalCard({ approval }: { approval: ApprovalRequest }) {
  const [modal, setModal] = useState<"edit" | "teach" | "approve" | "reject" | null>(null);
  const [editVersion, setEditVersion] = useState(approval.version);
  const [lesson, setLesson] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const decisionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { ready, feedback, mode, busy, canEdit, roleError, editDrafts } = useWorkspace();
  const { decideApproval, showError, teachRaven, setEditDraft, clearEditDrafts } = useWorkspace();
  // Her rewrite lives in the workspace store, keyed to the draft she edited, so closing the
  // dialog, reloading the tab or signing out can never quietly replace it with the stored brief.
  const [keptEdit, unsavedEdit, keptVersion] = keptEditFor(editDrafts, approval);
  const draft = keptEdit ?? approval.draft;
  const lessons = feedback.filter((f) => f.approval_request_id === approval.id);
  const isDecision = modal === "approve" || modal === "reject";
  const pending = busy || saving;
  const changedSinceOpening = modal !== null && modal !== "teach" && (approval.version !== editVersion || approval.status !== "pending");
  function requestDecision(type: "approve" | "reject", trigger: HTMLButtonElement) {
    decisionTriggerRef.current = trigger;
    setEditVersion(approval.version);
    setFormError(null);
    setModal(type);
  }
  async function save() {
    if (!modal || pending || submitLock.current || !ready || !canEdit || changedSinceOpening) return;
    submitLock.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const saved = modal === "teach"
        ? await teachRaven(approval.id, lesson)
        : await decideApproval(approval.id, modal === "edit" ? { type: "edit", draft } : { type: modal }, editVersion);
      if (saved) {
        if (modal !== "teach") clearEditDrafts(approval.id);
        setModal(null);
        setLesson("");
      } else setFormError("Could not save. Your decision has not been confirmed. Check the workspace notice and try again.");
    } catch (error) {
      showError(error);
      setFormError("Could not save. Your decision has not been confirmed. Check the workspace notice and try again.");
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }
  return (
    <Card className="approval-card">
      <div className="approval-heading">
        <span className="approval-type">
          <BookOpen size={15} />
          {approval.type} review
        </span>
        <DemoBadge origin={approval.data_origin} />
        <span className={`status-pill status-${approval.status}`}>
          {statusLabels[approval.status]}
        </span>
      </div>
      <h2 id={`brief-${approval.id}`} tabIndex={-1}>{approval.title}</h2>
      <p>{approval.description}</p>
      <details className="approval-draft" open>
        <summary>
          Proposed brief <span>· Draft {approval.version + 1}</span>
        </summary>
        <pre>{approval.draft}</pre>
      </details>
      <div className="approval-actions">
        {approval.status === "pending" ? (
          <>
            <Button disabled={!ready || pending || !canEdit} onClick={(event) => requestDecision("approve", event.currentTarget)}>
              <Check size={15} />
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={!ready || pending || !canEdit}
              onClick={() => {
                decisionTriggerRef.current = null;
                setEditVersion(approval.version);
                setFormError(null);
                setModal("edit");
              }}
            >
              <PencilLine size={14} />
              Edit
            </Button>
            <Button
              variant="ghost"
              disabled={!ready || pending || !canEdit}
              onClick={(event) => requestDecision("reject", event.currentTarget)}
            >
              <X size={15} />
              Reject
            </Button>
          </>
        ) : (
          <span className="decision-recorded">
            <CheckCheck size={15} />
            {approval.status === "approved"
              ? "Decision recorded · No external action"
              : "Rejected · Kept for audit history"}
          </span>
        )}
        <Button
          variant="outline"
          className="teach-button"
          disabled={!ready || pending || !canEdit}
          onClick={() => {
            decisionTriggerRef.current = null;
            setFormError(null);
            setModal("teach");
          }}
        >
          <Lightbulb size={14} />
          Teach Raven
        </Button>
        <EvidenceDrawer evidence={approval.evidence} label="Evidence" />
      </div>
      {approval.status === "pending" && <p className="approval-finality">Approving or rejecting is final: the brief becomes read-only. You can still add a lesson.</p>}
      {unsavedEdit !== null && approval.status === "pending" && (
        <p className="approval-unsaved">
          <span>
            You have unsaved edits to this brief, kept in this tab until you save them.
            {keptVersion !== approval.version && ` You wrote them against Draft ${keptVersion + 1}; this brief is now Draft ${approval.version + 1}.`}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!ready || pending || !canEdit}
            onClick={() => {
              decisionTriggerRef.current = null;
              setEditVersion(approval.version);
              setFormError(null);
              setModal("edit");
            }}
          >
            Continue editing
          </Button>
        </p>
      )}
      {!canEdit && <p className="quiet-note">{roleError ? "Decisions and lessons are paused until your permissions can be checked. You can still read this brief and its evidence." : "Viewer access · You can read this brief and its evidence. An owner or editor can record decisions and lessons."}</p>}
      {lessons.length > 0 && (
        <div className="saved-lessons">
          <span className="eyebrow">
            YOUR GUIDANCE · {lessons.length} SAVED
          </span>
          {lessons.map((l) => (
            <p key={l.id}>
              “{l.feedback}”
              <small>
                Your note · {l.created_at.slice(0, 10)} ·{" "}
                {mode === "demo" ? "Stored locally" : "Saved to workspace"}
              </small>
            </p>
          ))}
        </div>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setModal(null);
        }}
      >
        <DialogContent showCloseButton={!saving}
          onOpenAutoFocus={(event) => {
            if (isDecision) { event.preventDefault(); cancelRef.current?.focus(); }
          }}
          onCloseAutoFocus={(event) => {
            const trigger = decisionTriggerRef.current;
            if (!trigger) return;
            const target = trigger.isConnected ? trigger : document.getElementById("desk-reviewed-tab");
            if (target) { event.preventDefault(); target.focus(); }
          }}>
          <DialogHeader>
            <span className="eyebrow">CASSANDRA’S DESK</span>
            <DialogTitle className="serif text-3xl">
              {isDecision ? modal === "approve" ? "Approve this brief?" : "Reject this brief?" : modal === "edit"
                ? "Make it yours."
                : "What did the numbers miss?"}
            </DialogTitle>
            <DialogDescription>
              {isDecision ? `You are about to ${modal} “${approval.title}”. This decision is final: the brief becomes read-only and cannot be reopened or edited. You can still add a lesson. Nothing will be published, sent, purchased, or changed outside this workspace.` : modal === "edit"
                ? "Save an edited brief for review. Editing does not approve it."
                : "Tell Raven what the numbers missed. Your guidance is saved for future use; it does not retrain a model."}
            </DialogDescription>
          </DialogHeader>
          {!isDecision && <><label
            htmlFor={`approval-input-${approval.id}`}
            className="form-label"
          >
            {modal === "edit"
              ? "Campaign or review brief"
              : "What should Raven remember?"}
          </label>
          <Textarea
            readOnly={!canEdit || pending}
            id={`approval-input-${approval.id}`}
            rows={modal === "edit" ? 12 : 6}
            value={modal === "edit" ? draft : lesson}
            maxLength={modal === "edit" ? 10000 : 4000}
            onChange={(e) =>
              modal === "edit"
                ? setEditDraft(approval.id, approval.version, e.target.value === approval.draft ? null : e.target.value)
                : setLesson(e.target.value)
            }
            placeholder="Those readers aren’t my audience. Here’s what matters…"
          /></>}
          {changedSinceOpening && <p role="alert" className="form-error">This brief changed while you were reviewing it. Cancel, read the latest version, then choose your next step.</p>}
          {!canEdit && <p role="alert" className="form-error">{roleError ? "Your permissions could not be checked. Close this dialog and retry the permission check before making a decision." : "Your access no longer allows changes. You can cancel and read this brief."}</p>}
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button ref={cancelRef} variant="ghost" disabled={saving} onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              disabled={!ready || pending || !canEdit || changedSinceOpening || (!isDecision && !(modal === "edit" ? draft : lesson).trim())}
              onClick={save}
            >
              {saving ? "Saving…" : modal === "approve" ? "Confirm approval" : modal === "reject" ? "Confirm rejection" : modal === "edit" ? "Save draft" : "Save lesson"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
