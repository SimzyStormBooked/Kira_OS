"use client";
import { useState } from "react";
import { Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { agentRecipes, starterForRecipe } from "@/lib/data/agent-recipes";
import { studioRequestSignature } from "@/lib/ai/studio-contract";
import { keptEditFor, useWorkspace } from "@/lib/db/demo-store";
import "./desk.css";
type KeptDraft = { id: string; label: string; text: string };
/**
 * A lapsed session and an unreadable demo file are the two moments the app could take
 * unsaved words away from her. Both stop and hand the words back before anything is cleared.
 */
export function SessionEndedDialog() {
  const {
    sessionEnded, corruptWorkspace, scratchpad, learnScratchpad, studioScratchpad,
    approvals, editDrafts, leaveEndedSession, downloadCorruptWorkspace, startFreshDemoWorkspace, showError,
  } = useWorkspace();
  const [copied, setCopied] = useState<string | null>(null);
  const kept: KeptDraft[] = [];
  if (scratchpad.title.trim() || scratchpad.draft.trim())
    kept.push({
      id: "desk-idea",
      label: "Your unfinished idea at Cassandra’s Desk",
      text: [scratchpad.title.trim(), scratchpad.draft.trim()].filter(Boolean).join("\n\n"),
    });
  for (const recipe of agentRecipes) {
    const input = learnScratchpad.drafts[recipe.id];
    const signature = JSON.stringify({ recipeId: recipe.id, input });
    if (
      JSON.stringify(input) === JSON.stringify(starterForRecipe(recipe)) ||
      learnScratchpad.savedSignatures[recipe.id] === signature ||
      learnScratchpad.downloadedSignatures[recipe.id] === signature
    )
      continue;
    kept.push({
      id: `learn-${recipe.id}`,
      label: `Your notes in Learn & Create · ${recipe.name}`,
      text: `Name\n${input.name}\n\nWhat it should help you do\n${input.goal}\n\nWhat it should know first\n${input.context}\n\nWhat a useful result looks like\n${input.success}`,
    });
  }
  if (studioScratchpad.prompt.trim() && studioScratchpad.savedSignature !== studioRequestSignature(studioScratchpad))
    kept.push({ id: "studio-question", label: "Your unsent question for Ask Raven", text: studioScratchpad.prompt });
  for (const approval of approvals) {
    const [, unsaved] = keptEditFor(editDrafts, approval);
    if (unsaved !== null) kept.push({ id: `brief-${approval.id}`, label: `Your edits to “${approval.title}”`, text: unsaved });
  }
  async function copyDraft(draft: KeptDraft) {
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(draft.label);
    } catch {
      setCopied(null);
      showError(new Error("This browser blocked copying. Select the text in the box and copy it yourself."));
    }
  }
  function startFresh() {
    try {
      startFreshDemoWorkspace();
    } catch (error) {
      showError(error);
    }
  }
  return (
    <>
      <Dialog open={sessionEnded}>
        <DialogContent
          showCloseButton={false}
          className="session-ended-dialog"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <DialogTitle className="serif text-3xl">Your session ended</DialogTitle>
            <DialogDescription>
              Your sign-in expired, so nothing can be saved to your workspace right now. Your
              unfinished words are below, exactly as you left them. Copy anything you want to keep,
              then sign in again. Everything you already saved is untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="session-ended-drafts">
            {kept.map((draft) => (
              <div className="session-ended-draft" key={draft.id}>
                <div className="session-ended-draft-top">
                  <label htmlFor={`kept-${draft.id}`}>{draft.label}</label>
                  <Button variant="outline" size="sm" onClick={() => void copyDraft(draft)}>
                    <Copy size={14} />
                    Copy
                  </Button>
                </div>
                <Textarea id={`kept-${draft.id}`} readOnly rows={draft.text.length > 400 ? 8 : 4} value={draft.text} />
              </div>
            ))}
          </div>
          <p className="session-ended-status" role="status">
            {copied ? `Copied to your clipboard: ${copied}` : ""}
          </p>
          <DialogFooter>
            <Button onClick={leaveEndedSession}>Sign in again</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={corruptWorkspace !== null}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <span className="eyebrow">
              <TriangleAlert size={13} aria-hidden="true" /> DEMO WORKSPACE
            </span>
            <DialogTitle className="serif text-3xl">This browser holds a demo file we cannot read</DialogTitle>
            <DialogDescription>
              An earlier demo workspace is saved in this browser in a format this version cannot
              open. It has not been changed or deleted, and nothing is saved over it until you
              choose. Download a copy if you want it, then start fresh to keep exploring.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={downloadCorruptWorkspace}>
              Download the unreadable workspace file
            </Button>
            <Button onClick={startFresh}>Start a fresh demo workspace</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
