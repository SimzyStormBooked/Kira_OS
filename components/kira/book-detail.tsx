"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  FileCheck2,
  ChevronDown,
  ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { series } from "@/lib/data/seed";
import { useWorkspace } from "@/lib/db/demo-store";
import type { Book } from "@/types/domain";
import { BookCover } from "./book-card";
import { DemoBadge } from "./origin-badge";
const sections = [
  "Overview",
  "Series",
  "Characters",
  "Relationships",
  "Tropes",
  "Themes",
  "Reader Language",
  "Reviews",
  "Marketing Assets",
  "Social Performance",
  "SEO",
  "Campaign History",
  "Products",
  "Purchase Links",
];
export function BookDetail({ book }: { book: Book }) {
  const collection = series.find((s) => s.id === book.series_id)!;
  const router = useRouter();
  const { mode, ready, busy, canEdit, roleError, scratchpad, updateScratchpad } = useWorkspace();
  const [replaceOpen, setReplaceOpen] = useState(false);
  const prepareButtonRef = useRef<HTMLButtonElement>(null);
  function prepareDetails() {
    if (!ready || busy || !canEdit) return;
    updateScratchpad({
      title: `Review book details · ${book.title}`,
      draft: [
        "BOOK DETAILS FOR REVIEW · MANUAL COLLECTION",
        `VERIFIED STARTING POINT\nTitle: ${book.title}\nSeries / collection: ${collection.name}\nListed order: Book ${book.series_order}\nOfficial source: ${book.source_url}\nSource checked: ${book.verified_at.slice(0, 10)}`,
        ...(collection.note ? [`SOURCE NOTE\n${collection.note}`] : []),
        "APPROVED DESCRIPTION\n[Paste the exact author-approved description here. Leave blank until you have it; do not generate or infer book details.]",
        "APPROVED MATERIALS & LINKS\n[Add links to the official cover, retailer pages, or other approved materials. Include the source, date checked, and permission to use each one. Files are not uploaded through this brief.]",
        "WHAT NEEDS CHECKING\n[List corrections, missing information, and questions for the person updating the catalog.]",
        "DECISION TO MAKE\nReview which supplied details may be used. Saving or approving this brief keeps a review record only; it does not change this catalog or publish anything.",
      ].join("\n\n"),
      ideaId: null,
    });
    setReplaceOpen(false);
    router.push("/desk");
  }
  return (
    <>
      <Link href="/universe" className="text-link back-link">
        <ArrowLeft size={14} />
        Back to The Universe
      </Link>
      <div className="book-detail-grid">
        <div>
          <BookCover book={book} large />
          <p className="cover-caption">
            Decorative placeholder. Official cover not imported.
          </p>
        </div>
        <div className="book-detail-content">
          <div className="eyebrow page-kicker">
            {collection.name} / BOOK {book.series_order}
          </div>
          <h1>{book.title}</h1>
          <p className="book-byline">By Kira Stanley</p>
          <div className="book-detail-badges">
            <DemoBadge origin="public_verified" />
            <span className="verification-label">
              <i />
              Partial record
            </span>
          </div>
          <p className="book-detail-intro">
            Start with its verified title, collection, and listed order. Keep
            approved copy and source links together in a brief for review.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Title</dt>
              <dd>{book.title}</dd>
            </div>
            <div>
              <dt>Series / collection</dt>
              <dd>{collection.name}</dd>
            </div>
            <div>
              <dt>Listed order</dt>
              <dd>Book {book.series_order}</dd>
            </div>
            <div>
              <dt>Source checked</dt>
              <dd>{book.verified_at.slice(0, 10)}</dd>
            </div>
            <div>
              <dt>Overview & genre</dt>
              <dd>NEEDS VERIFICATION</dd>
            </div>
          </dl>
          {collection.note && <p className="quiet-note">{collection.note}</p>}
          <div className="book-detail-actions">
            <Button asChild variant="outline">
              <a href={book.source_url} target="_blank" rel="noreferrer">
                View author source
                <ArrowUpRight size={14} />
              </a>
            </Button>
            <Button asChild>
              <Link href="/desk">
                <FileCheck2 size={14} />
                Cassandra’s Desk
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <Card className="book-materials-card">
        <div className="section-heading"><h2>Bring the details you trust.</h2><FileCheck2 size={21} aria-hidden="true" /></div>
        <p>Prepare a brief for this book with its verified source already included. Add your approved description, cover link, retailer links, and anything that needs correcting.</p>
        <Button ref={prepareButtonRef} type="button" disabled={!ready || busy || !canEdit} onClick={() => {
          if (scratchpad.title.trim() || scratchpad.draft.trim()) setReplaceOpen(true);
          else prepareDetails();
        }}>Prepare book details <ArrowUpRight size={14} aria-hidden="true" /></Button>
        <p className="quiet-note">This opens an editable, unsaved brief at Cassandra’s Desk. Saving or approving it records your materials for review; catalog editing and file uploads are still to come.</p>
        {!canEdit && <p className="quiet-note">{roleError ? "Preparing a shared brief is paused until your permissions can be checked." : "An owner or editor can prepare a brief. You can still read this book’s details and sources."}</p>}
      </Card>
      <details className="book-future-details" open={mode === "demo" ? true : undefined}>
        <summary><span>Details to add</span><ChevronDown size={17} aria-hidden="true" /></summary>
        <p className="quiet-note">Descriptions, characters, reviews, and business results have not been imported. These sections show what can be added in a future catalog update.</p>
      <Tabs defaultValue="Overview" className="book-tabs">
        <TabsList className="book-tabs-list">
          {sections.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s} value={s}>
            <Card className="book-knowledge-panel">
              {s === "Series" ? (
                <>
                  <span className="eyebrow">SOURCED COLLECTION</span>
                  <h2>{collection.name}</h2>
                  <p>
                    Listed as book {book.series_order} on the official author
                    site.
                  </p>
                  {collection.note && <p>{collection.note}</p>}
                  <a
                    href={book.source_url}
                    className="text-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify at source <ArrowUpRight size={14} />
                  </a>
                </>
              ) : s === "Purchase Links" ? (
                <>
                  <span className="eyebrow">OFFICIAL AUTHOR SITE</span>
                  <h2>Go straight to the source.</h2>
                  <p>
                    This opens the official collection page. Product
                    availability and retailer links have not been verified.
                  </p>
                  <a
                    href={book.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Visit official collection <ArrowUpRight size={14} />
                  </a>
                </>
              ) : (
                <>
                  <ShieldQuestion size={28} strokeWidth={1.2} />
                  <span className="verification-label">NEEDS VERIFICATION</span>
                  <h2>
                    {s === "Overview"
                      ? "The story is yours."
                      : `${s}, with receipts.`}
                  </h2>
                  <p>
                    {s === "Overview"
                      ? "No description has been imported. Approved author copy will become read-only reference material for your business work."
                      : `No verified ${s.toLowerCase()} have been imported for this book. Nothing has been inferred from its title or cover.`}
                  </p>
                  <span className="quiet-note">
                    Later, approved source documents and your verification will
                    attach here.
                  </span>
                </>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      </details>
      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); prepareButtonRef.current?.focus(); }}>
          <DialogHeader><DialogTitle>Keep your unfinished idea?</DialogTitle><DialogDescription>You already have words at your desk. Open that brief as it is, or replace it with a book-details starter for {book.title}. Nothing has been saved or changed yet.</DialogDescription></DialogHeader>
          <DialogFooter className="book-materials-choices">
            <Button type="button" variant="ghost" onClick={() => setReplaceOpen(false)}>Stay with this book</Button>
            <Button type="button" variant="outline" onClick={() => { setReplaceOpen(false); router.push("/desk"); }}>Open my current brief</Button>
            <Button type="button" disabled={!ready || busy || !canEdit} onClick={prepareDetails}>Replace with book details</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
