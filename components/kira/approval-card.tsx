"use client";
import { useState } from "react";
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
import { useWorkspace } from "@/lib/db/demo-store";
import type { ApprovalRequest } from "@/types/domain";
import { DemoBadge } from "./origin-badge";
import { EvidenceDrawer } from "./evidence-drawer";
export function ApprovalCard({ approval }: { approval: ApprovalRequest }) {
  const [modal, setModal] = useState<"edit" | "teach" | null>(null);
  const [draft, setDraft] = useState("");
  const [editVersion, setEditVersion] = useState(approval.version);
  const [lesson, setLesson] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { ready, feedback, mode, busy } = useWorkspace();
  const { decideApproval, showError, teachRaven } = useWorkspace();
  const lessons = feedback.filter((f) => f.approval_request_id === approval.id);
  async function decide(type: "approve" | "reject") {
    try {
      await decideApproval(approval.id, { type }, approval.version);
    } catch (e) {
      showError(e);
    }
  }
  async function save() {
    const saved =
      modal === "edit"
        ? await decideApproval(
            approval.id,
            { type: "edit", draft },
            editVersion,
          )
        : await teachRaven(approval.id, lesson);
    if (saved) {
      setModal(null);
      setLesson("");
      setFormError(null);
    } else
      setFormError("Could not save. Check the workspace notice and try again.");
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
          {approval.status}
        </span>
      </div>
      <h2>{approval.title}</h2>
      <p>{approval.description}</p>
      <details className="approval-draft" open>
        <summary>
          Proposed brief <span>VERSION {approval.version + 1}</span>
        </summary>
        <pre>{approval.draft}</pre>
      </details>
      <div className="approval-actions">
        {approval.status === "pending" ? (
          <>
            <Button disabled={!ready || busy} onClick={() => decide("approve")}>
              <Check size={15} />
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={!ready || busy}
              onClick={() => {
                setDraft(approval.draft);
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
              disabled={!ready || busy}
              onClick={() => decide("reject")}
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
          disabled={!ready || busy}
          onClick={() => {
            setFormError(null);
            setModal("teach");
          }}
        >
          <Lightbulb size={14} />
          Teach Raven
        </Button>
        <EvidenceDrawer evidence={approval.evidence} label="Evidence" />
      </div>
      {lessons.length > 0 && (
        <div className="saved-lessons">
          <span className="eyebrow">
            YOUR GUIDANCE · {lessons.length} SAVED
          </span>
          {lessons.map((l) => (
            <p key={l.id}>
              “{l.feedback}”
              <small>
                Human feedback · {l.created_at.slice(0, 10)} ·{" "}
                {mode === "demo" ? "Stored locally" : "Saved to workspace"}
              </small>
            </p>
          ))}
        </div>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <span className="eyebrow">CASSANDRA’S DESK</span>
            <DialogTitle className="serif text-3xl">
              {modal === "edit"
                ? "Make it yours."
                : "Instinct is intelligence."}
            </DialogTitle>
            <DialogDescription>
              {modal === "edit"
                ? "Save an edited brief for review. Editing does not approve it."
                : "Tell Raven what the numbers missed. Your guidance is saved for future use; it does not retrain a model."}
            </DialogDescription>
          </DialogHeader>
          <label
            htmlFor={`approval-input-${approval.id}`}
            className="form-label"
          >
            {modal === "edit"
              ? "Campaign or review brief"
              : "What should Raven remember?"}
          </label>
          <Textarea
            id={`approval-input-${approval.id}`}
            rows={modal === "edit" ? 12 : 6}
            value={modal === "edit" ? draft : lesson}
            maxLength={modal === "edit" ? 10000 : 4000}
            onChange={(e) =>
              modal === "edit"
                ? setDraft(e.target.value)
                : setLesson(e.target.value)
            }
            placeholder="Those readers aren’t my audience. Here’s what matters…"
          />
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !(modal === "edit" ? draft : lesson).trim()}
              onClick={save}
            >
              {modal === "edit" ? "Save draft" : "Save lesson"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
