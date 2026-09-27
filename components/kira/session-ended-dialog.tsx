"use client";
import { useState } from "react";
import { Copy, Download, TriangleAlert } from "lucide-react";
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
import { useWorkspace } from "@/lib/db/demo-store";
import { useKeptDrafts } from "./kept-drafts";
import "./desk.css";
/**
 * A lapsed session, an unreadable demo file and an unreadable stored draft are the three
 * moments the app could take unsaved words away from her. Each one stops and hands the
 * words back before anything is cleared or written over.
 */
export function SessionEndedDialog() {
  const {
    sessionEnded, corruptWorkspace, unreadableDrafts, leaveEndedSession, downloadCorruptWorkspace,
    downloadUnreadableDrafts, dismissUnreadableDrafts, startFreshDemoWorkspace, showError,
  } = useWorkspace();
  const kept = useKeptDrafts();
  const [copied, setCopied] = useState<string | null>(null);
  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
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
            <span className="eyebrow">Your workspace</span>
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
                  <Button variant="outline" size="sm" onClick={() => void copyText(draft.label, draft.text)}>
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
              <TriangleAlert size={13} aria-hidden="true" /> Demo workspace
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
      <Dialog open={unreadableDrafts !== null && !sessionEnded && corruptWorkspace === null}>
        <DialogContent
          showCloseButton={false}
          className="session-ended-dialog"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <span className="eyebrow">
              <TriangleAlert size={13} aria-hidden="true" /> Unfinished words
            </span>
            <DialogTitle className="serif text-3xl">We could not reopen the draft this tab was holding</DialogTitle>
            <DialogDescription>
              This tab had unfinished words stored from an earlier visit, and this version of the
              workspace cannot read the file they were in. Nothing you saved to your workspace is
              affected. The stored text is below exactly as it was found. Copy or download it if
              you want it, then continue — continuing removes this unreadable copy.
            </DialogDescription>
          </DialogHeader>
          <div className="session-ended-drafts">
            <div className="session-ended-draft">
              <div className="session-ended-draft-top">
                <label htmlFor="unreadable-drafts">The stored text, as found</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText("The stored text, as found", unreadableDrafts ?? "")}
                >
                  <Copy size={14} />
                  Copy
                </Button>
              </div>
              <Textarea id="unreadable-drafts" readOnly rows={10} value={unreadableDrafts ?? ""} />
            </div>
          </div>
          <p className="session-ended-status" role="status">
            {copied ? `Copied to your clipboard: ${copied}` : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={downloadUnreadableDrafts}>
              <Download size={15} />
              Download the unreadable draft file
            </Button>
            <Button onClick={dismissUnreadableDrafts}>Continue without them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
