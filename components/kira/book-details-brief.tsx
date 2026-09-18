"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/db/demo-store";
import type { LibraryBook } from "@/lib/manuscripts/library-contract";
export function BookDetailsBrief({ book, seriesName }: { book: LibraryBook; seriesName: string }) {
  const { ready, busy, canEdit, scratchpad, updateScratchpad } = useWorkspace();
  const [choice, setChoice] = useState(false); const button = useRef<HTMLButtonElement>(null); const router = useRouter();
  function prepare() {
    if (!ready || busy || !canEdit) return;
    updateScratchpad({ title: `Review book details · ${book.title}`, ideaId: null, draft: [
      "BOOK DETAILS FOR REVIEW · MANUAL COLLECTION",
      `Title: ${book.title}\nSeries / collection: ${seriesName}\n${book.series_order ? `Listed order: Book ${book.series_order}\n` : ""}${book.source_url ? `Official source: ${book.source_url}` : "Source: author-provided book details"}`,
      `APPROVED DESCRIPTION\n${book.overview || "[Add the author-approved description when ready.]"}`,
      "APPROVED MATERIALS & LINKS\n[Add existing cover, retailer or marketing links with permission and date checked.]",
      "WHAT NEEDS CHECKING\n[List your questions and corrections.]",
      "Saving or approving this brief records your review only. It does not change this catalog or publish anything. Use Edit book details to update metadata and the manuscript panel for private uploads.",
    ].join("\n\n") });
    setChoice(false); router.push("/desk");
  }
  return <><Button ref={button} variant="outline" type="button" disabled={!ready || busy || !canEdit} onClick={() => { if (scratchpad.title.trim() || scratchpad.draft.trim()) setChoice(true); else prepare(); }}>Prepare book details</Button>
    <Dialog open={choice} onOpenChange={setChoice}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); button.current?.focus(); }}><DialogHeader><DialogTitle>Keep your unfinished brief?</DialogTitle><DialogDescription>You already have words at your desk. Keep those words, or replace the unsaved draft with a starter for this book.</DialogDescription></DialogHeader><DialogFooter className="book-materials-choices"><Button variant="ghost" onClick={() => setChoice(false)}>Stay with this book</Button><Button variant="outline" onClick={() => { setChoice(false); router.push("/desk"); }}>Open my current brief</Button><Button onClick={prepare}>Replace with book details</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
