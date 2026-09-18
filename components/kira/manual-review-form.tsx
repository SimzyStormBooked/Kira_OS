"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, FilePlus2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/db/demo-store";

export function ManualReviewForm() {
  const { createManualReview, busy, ready } = useWorkspace();
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const submission = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pending = busy || submitting;

  async function saveBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || busy || !ready) return;
    setSaved(false);
    if (!title.trim() || !draft.trim()) {
      setError("Give your brief a title and add the idea you want to review.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    submission.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const success = await createManualReview(title.trim(), draft.trim());
      if (success) {
        setTitle("");
        setDraft("");
        setSaved(true);
      } else {
        setError("Your brief could not be saved. Your text is still here; please try again.");
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } catch {
      setError("We could not reach your workspace. Your text is still here; please try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submission.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Card className="manual-review-card">
      <div className="manual-review-heading">
        <span className="manual-review-icon"><FilePlus2 size={21} strokeWidth={1.4} aria-hidden="true" /></span>
        <div><span className="eyebrow">MAKE ROOM FOR THE NEXT GOOD IDEA</span><h2>Add a <em>business brief.</em></h2></div>
      </div>
      <p className="manual-review-intro">A marketing plan, an outreach idea, or an update you want to review. Save it here, then refine it in your own time.</p>
      <form className="manual-review-form" onSubmit={saveBrief} aria-busy={pending}>
        <div className="manual-review-field">
          <label className="form-label" htmlFor="manual-brief-title">Give it a title</label>
          <Input id="manual-brief-title" name="title" value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} required maxLength={200} disabled={pending || !ready} placeholder="For example, a fall reading-list promotion" />
        </div>
        <div className="manual-review-field">
          <div className="manual-review-label"><label className="form-label" htmlFor="manual-brief-draft">Your brief</label><span>{draft.length.toLocaleString("en-US")} / 10,000</span></div>
          <Textarea id="manual-brief-draft" name="draft" value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} required maxLength={10000} rows={5} disabled={pending || !ready} aria-describedby="manual-brief-help" placeholder="What would you like to try? What should we know before making a decision?" />
          <p id="manual-brief-help" className="manual-review-help">Include the goal, the relevant books, and anything you want to verify.</p>
        </div>
        {error && <p className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
        <div className="manual-review-footer">
          <span><ShieldCheck size={14} aria-hidden="true" /> Saved privately for your review.</span>
          <Button type="submit" disabled={pending || !ready}>{pending ? "Saving your brief…" : "Save for review"}<ArrowRight size={15} /></Button>
        </div>
        <p className="manual-review-saved" role="status" aria-live="polite">{saved ? "Brief saved to Cassandra’s Desk. It is ready for your review." : ""}</p>
      </form>
    </Card>
  );
}
