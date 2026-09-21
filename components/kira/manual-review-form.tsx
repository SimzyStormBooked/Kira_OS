"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FilePlus2, Lightbulb, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/db/demo-store";
import { findInspirationIdea } from "@/lib/data/inspiration";

export function ManualReviewForm({ ideaId }: { ideaId?: string }) {
  const router = useRouter();
  const {
    createManualReview,
    busy,
    ready,
    mode,
    scratchpad,
    updateScratchpad,
    clearScratchpad,
    canEdit,
    roleError,
  } = useWorkspace();
  const { title, draft } = scratchpad;
  const [consumedIdea, setConsumedIdea] = useState<string | null>(null);
  const [previousIdeaId, setPreviousIdeaId] = useState(ideaId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState({ title: false, draft: false });
  const submission = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const currentIdeaId = useRef(ideaId);
  if (previousIdeaId !== ideaId) {
    setPreviousIdeaId(ideaId);
    setConsumedIdea(null);
  }
  useEffect(() => {
    currentIdeaId.current = ideaId;
  }, [ideaId]);
  const pending = busy || submitting;
  const idea = findInspirationIdea(ideaId ?? "");
  const hasDraft = Boolean(title.trim() || draft.trim());
  const needsChoice =
    idea &&
    consumedIdea !== idea.id &&
    scratchpad.ideaId !== idea.id &&
    hasDraft;
  useEffect(() => {
    if (
      pending || !canEdit ||
      !idea ||
      consumedIdea === idea.id ||
      scratchpad.ideaId === idea.id ||
      hasDraft
    )
      return;
    updateScratchpad({
      title: idea.briefTitle,
      draft: idea.briefDraft,
      ideaId: idea.id,
    });
    titleRef.current?.focus();
  }, [idea, consumedIdea, scratchpad.ideaId, hasDraft, pending, canEdit, updateScratchpad]);
  function replaceWithIdea() {
    if (!idea || pending || !canEdit) return;
    updateScratchpad({
      title: idea.briefTitle,
      draft: idea.briefDraft,
      ideaId: idea.id,
    });
    setConsumedIdea(idea.id);
    setSaved(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  async function saveBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || busy || !ready || !canEdit) return;
    setSaved(false);
    if (!title.trim() || !draft.trim()) {
      setInvalid({ title: !title.trim(), draft: !draft.trim() });
      setError("Give your idea a title and add the idea you want to review.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    submission.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const success = await createManualReview(title.trim(), draft.trim());
      if (success) {
        setInvalid({ title: false, draft: false });
        setConsumedIdea(idea?.id ?? null);
        clearScratchpad(scratchpad);
        setSaved(true);
        if (ideaId && currentIdeaId.current === ideaId)
          router.replace("/desk", { scroll: false });
      } else {
        setError(
          "Your idea could not be saved. Your text is still here; please try again.",
        );
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } catch {
      setError(
        "We could not reach your workspace. Your text is still here; please try again.",
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submission.current = false;
      setSubmitting(false);
    }
  }
  return (
    <Card className="manual-review-card" id="new-brief">
      <div className="manual-review-heading">
        <span className="manual-review-icon">
          <FilePlus2 size={21} strokeWidth={1.4} aria-hidden="true" />
        </span>
        <div>
          <span className="eyebrow">A PLACE FOR YOUR NEXT GOOD IDEA</span>
          <h2>
            Add an <em>idea or request.</em>
          </h2>
        </div>
      </div>
      <p className="manual-review-intro">
        This is a place to save an idea or request with a little context. Capture a promotion,
        reader question, or book update. You can refine it before deciding.
      </p>
      {!canEdit && <p className="quiet-note" role="status">{roleError ? "Saving is paused until your permissions can be checked. Your unfinished draft stays here while you explore." : "You have viewer access. You can read ideas and evidence; an owner or editor can save changes. Any unfinished draft stays here while you explore."}</p>}
      {needsChoice && (
        <div
          className="idea-draft-choice"
          role="region"
          aria-label="Keep your unfinished idea"
        >
          <Lightbulb size={18} aria-hidden="true" />
          <div>
            <strong>You already have an unfinished idea.</strong>
            <p>
              Keep your words, or replace them with “{idea.title}”. Nothing
              changes until you choose.
            </p>
            <div className="idea-draft-choice-actions">
              <Button
                variant="outline"
                disabled={pending || !canEdit}
                onClick={() => {
                  setConsumedIdea(idea.id);
                  requestAnimationFrame(() => titleRef.current?.focus());
                }}
              >
                Keep my draft
              </Button>
              <Button variant="ghost" onClick={replaceWithIdea} disabled={pending || !canEdit}>
                Replace with this idea
              </Button>
            </div>
          </div>
        </div>
      )}
      {scratchpad.ideaId && !needsChoice && (
        <p className="idea-prefill-note">
          <Lightbulb size={14} aria-hidden="true" /> A starting point from the
          idea shelf. Change anything; it is not saved yet.
        </p>
      )}
      <form
        className="manual-review-form"
        onSubmit={saveBrief}
        aria-busy={pending}
      >
        <div className="manual-review-field">
          <label className="form-label" htmlFor="manual-brief-title">
            Give it a title
          </label>
          <Input
            ref={titleRef}
            id="manual-brief-title"
            name="title"
            value={title}
            onChange={(e) => {
              updateScratchpad({ title: e.target.value });
              setInvalid((current) => ({ ...current, title: false }));
              setSaved(false);
            }}
            aria-required="true"
            aria-invalid={invalid.title || undefined}
            aria-errormessage={invalid.title ? "manual-brief-error" : undefined}
            maxLength={200}
            disabled={pending || !ready || !canEdit}
            placeholder="For example, a fall reading-list promotion"
          />
        </div>
        <div className="manual-review-field">
          <div className="manual-review-label">
            <label className="form-label" htmlFor="manual-brief-draft">
              Your idea
            </label>
            <span id="manual-draft-count" role="status">
              <span aria-hidden="true">
                {draft.length.toLocaleString("en-US")} / 10,000
              </span>
              <span className="sr-only">
                {draft.length >= 10000
                  ? "Character limit reached: 10,000 of 10,000 characters."
                  : draft.length >= 9000
                    ? "Fewer than 1,000 characters left of 10,000."
                    : "Limit 10,000 characters."}
              </span>
            </span>
          </div>
          <Textarea
            id="manual-brief-draft"
            name="draft"
            value={draft}
            onChange={(e) => {
              updateScratchpad({ draft: e.target.value });
              setInvalid((current) => ({ ...current, draft: false }));
              setSaved(false);
            }}
            aria-required="true"
            aria-invalid={invalid.draft || undefined}
            aria-errormessage={invalid.draft ? "manual-brief-error" : undefined}
            maxLength={10000}
            rows={5}
            disabled={pending || !ready || !canEdit}
            aria-describedby="manual-brief-help manual-draft-state manual-draft-count"
            placeholder="What would you like to try? Which book is it for? What needs checking first?"
          />
          <p id="manual-brief-help" className="manual-review-help">
            A few sentences are enough. You can edit the saved idea before
            approving it.
          </p>
        </div>
        {error && (
          <p id="manual-brief-error" className="form-error" role="alert" ref={errorRef} tabIndex={-1}>
            {error}
          </p>
        )}
        <div className="manual-review-footer">
          <span id="manual-draft-state">
            <ShieldCheck size={14} aria-hidden="true" />
            {hasDraft
              ? "Not saved yet · Kept in this tab until you save."
              : mode === "demo"
                ? "Saving keeps this idea in this browser."
                : "Saving keeps this idea in your private workspace."}
          </span>
          <Button type="submit" disabled={pending || !ready || !canEdit}>
            {pending ? "Saving your idea…" : "Save for review"}
            <ArrowRight size={15} />
          </Button>
        </div>
        <p className="manual-review-saved" role="status" aria-live="polite">
          {saved && !hasDraft
            ? "Brief saved to Cassandra’s Desk. It is ready for your review."
            : ""}
        </p>
      </form>
    </Card>
  );
}
