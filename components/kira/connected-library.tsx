"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { libraryInputSchema, libraryBookSchema, type LibraryBook, type LibrarySeries } from "@/lib/manuscripts/library-contract";
import { LibraryRequestError, useLibrary } from "./library-provider";
import { BookCover } from "./book-card";

export function BookMetadataForm({ book, series, onSaved, onCancel, onDirtyChange }: {
  book?: LibraryBook; series: LibrarySeries[]; onSaved: (book: LibraryBook) => void; onCancel: () => void;
  /** Reports whether any field differs from what she opened the form with, so the dialog can guard a dismiss. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { request, reload } = useLibrary();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [seriesChoice, setSeriesChoice] = useState(book?.series_id ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  function typedSomething() {
    const form = formRef.current; if (!form) return false;
    return Array.from(form.elements).some(element => {
      if (element instanceof HTMLInputElement) return element.type === "checkbox" ? element.checked !== element.defaultChecked : element.value !== element.defaultValue;
      if (element instanceof HTMLTextAreaElement) return element.value !== element.defaultValue;
      if (element instanceof HTMLSelectElement) return element.value !== (book?.series_id ?? "");
      return false;
    });
  }
  const syncDirty = () => onDirtyChange?.(typedSomething());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setError("");
    const parsed = libraryInputSchema.safeParse({
      title: form.get("title"), seriesId: seriesChoice && seriesChoice !== "new" ? seriesChoice : null,
      ...(seriesChoice === "new" ? { seriesName: String(form.get("seriesName") ?? "") } : {}),
      seriesOrder: form.get("seriesOrder") ? Number(form.get("seriesOrder")) : null,
      overview: String(form.get("overview") ?? "").trim() || null,
      metadata: { genre: String(form.get("genre") ?? ""), audiobook_available: form.get("audio") === "on", narrator: String(form.get("narrator") ?? ""),
        ...(form.get("runtime") ? { runtime_minutes: Number(form.get("runtime")) } : {}), audio_notes: String(form.get("audioNotes") ?? "") },
      ...(book ? { expectedUpdatedAt: book.updated_at } : {}),
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the book details."); return; }
    setBusy(true);
    try {
      const response = await request(book ? `/api/library/${book.id}` : "/api/library", { method: book ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const saved = libraryBookSchema.parse((response as { book: unknown }).book); await reload(); onDirtyChange?.(false); onSaved(saved);
    } catch (failure) { setError(failure instanceof LibraryRequestError ? failure.message : "The book could not be saved. Your entries are still here."); }
    finally { setBusy(false); }
  }
  return <form ref={formRef} className="library-form" onSubmit={submit} aria-busy={busy} onInput={syncDirty} onChange={syncDirty}>
    <label>Book title<Input name="title" required maxLength={250} defaultValue={book?.title} autoFocus /></label>
    <div className="library-form-row"><label>Series or collection<select value={seriesChoice} onChange={event => setSeriesChoice(event.target.value)}><option value="">Standalone / decide later</option>{series.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">Create a series</option></select></label>
      <label>Book number<Input name="seriesOrder" type="number" min={1} max={10000} step={1} defaultValue={book?.series_order ?? ""} /></label></div>
    {seriesChoice === "new" && <label>New series name<Input name="seriesName" maxLength={200} required /></label>}
    <label>Genre / subgenre<Input name="genre" maxLength={200} defaultValue={book?.metadata.genre} placeholder="In your own words" /></label>
    <label>Author-approved description<Textarea name="overview" maxLength={10000} rows={4} defaultValue={book?.overview ?? ""} placeholder="Optional. Add your existing description; your writing stays yours." /></label>
    <details><summary>Audiobook details <span className="quiet-note">Optional</span></summary><div className="library-form">
      <label className="library-check"><input name="audio" type="checkbox" defaultChecked={book?.metadata.audiobook_available} /> Audiobook available</label>
      <label>Narrator<Input name="narrator" maxLength={200} defaultValue={book?.metadata.narrator} /></label>
      <label>Runtime in minutes<Input name="runtime" type="number" min={1} max={100000} defaultValue={book?.metadata.runtime_minutes ?? ""} /></label>
      <label>Audio marketing notes<Textarea name="audioNotes" maxLength={4000} defaultValue={book?.metadata.audio_notes} /></label>
    </div></details>
    {error && <p role="alert" className="library-error">{error}</p>}
    <div className="library-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : book ? "Save book details" : "Add book"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { onDirtyChange?.(typedSomething()); onCancel(); }}>Cancel</Button></div>
  </form>;
}

/** Radix dismiss gestures (Escape, outside click) must never throw away typed words. */
export function KeepEntriesDialog({ open, onKeep, onDiscard }: { open: boolean; onKeep: () => void; onDiscard: () => void }) {
  return <Dialog open={open} onOpenChange={next => { if (!next) onKeep(); }}><DialogContent>
    <DialogHeader><DialogTitle>Keep your unfinished entries?</DialogTitle><DialogDescription>You have typed details that are not saved yet. Closing now discards them.</DialogDescription></DialogHeader>
    <DialogFooter><Button type="button" onClick={onKeep}>Keep my entries</Button><Button type="button" variant="destructive" onClick={onDiscard}>Discard and close</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function ConnectedLibrary() {
  const { data, loading, error, reload } = useLibrary(); const router = useRouter();
  const [adding, setAdding] = useState(false); const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all");
  const [formDirty, setFormDirty] = useState(false); const [confirmClose, setConfirmClose] = useState(false);
  const closeAdd = () => { setFormDirty(false); setConfirmClose(false); setAdding(false); };
  const books = data?.books ?? []; const series = data?.series ?? [];
  const matches = books.filter(book => (filter === "all" || book.series_id === filter) && book.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="library-page">
    <div className="page-heading"><div><span className="eyebrow page-kicker">YOUR BOOKS / THE UNIVERSE</span><h1>Every book.<br /><em>Every possibility.</em></h1><p>A home for your books, the people inside them, and what comes next.</p></div>
      {data?.role !== "viewer" && data && <Button onClick={() => setAdding(true)}><Plus size={16} /> Add book</Button>}</div>
    <Card className="library-intro"><BookOpen size={25} /><div><h2>Your words stay yours.</h2><p>Add a manuscript. Raven reads it in small steps, saves reference passages, and shows you the passage behind every finding. You decide what belongs in your marketing.</p><span className="quiet-note">Kept privately in this workspace and never rewritten. Everyone with workspace access can read it, and versions cannot yet be removed from the app.</span></div></Card>
    {loading && !data && <><p role="status" className="sr-only">Opening your book library…</p><div className="book-grid" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(slot => <div className="book-card-skeleton" key={slot}><Skeleton className="book-card-skeleton-cover" /><div className="book-card-info"><Skeleton className="book-card-skeleton-line short" /><Skeleton className="book-card-skeleton-line wide" /><Skeleton className="book-card-skeleton-line" /></div></div>)}</div></>}
    {error && <div role="alert" className="library-error"><p>{error}</p><Button variant="outline" onClick={() => void reload()}>Reload library</Button></div>}
    {data && <><div className="catalog-toolbar"><div className="catalog-filters" role="group" aria-label="Filter by series"><Button variant={filter === "all" ? "secondary" : "ghost"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All titles <span>{books.length}</span></Button>{series.map(item => <Button key={item.id} variant={filter === item.id ? "secondary" : "ghost"} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.name}</Button>)}</div>
      <div className="catalog-search"><Search size={15} /><Input aria-label="Search catalog" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a book…" /></div></div>
      <div className="book-grid">{matches.map((book, index) => <Link href={`/universe/${encodeURIComponent(book.slug)}`} className="book-card" key={book.id}><BookCover book={{ title: book.title, accent: (["wine", "olive", "blue"] as const)[index % 3] }} /><div className="book-card-info"><span className="eyebrow">{series.find(item => item.id === book.series_id)?.name ?? "Standalone"}{book.series_order ? ` / Book ${book.series_order}` : ""}</span><h3>{book.title}<ArrowUpRight size={17} /></h3><span className="verification-label"><i />{book.active_manuscript_id ? "Book knowledge ready to explore" : "Ready for your manuscript"}</span></div></Link>)}</div>
      {!matches.length && <div className="empty-state"><BookOpen size={30} /><h2>{books.length ? "No titles found." : "Your next chapter starts here."}</h2><p>{books.length ? "Try another title or collection." : "Add a book, then bring its manuscript when you’re ready."}</p>{books.length > 0 && <Button variant="outline" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</Button>}</div>}
      <p className="catalog-footnote">Decorative covers are placeholders. Publicly sourced details and author-provided metadata retain their own provenance. Extracted knowledge needs your review.</p>
    </>}
    <Dialog open={adding} onOpenChange={next => { if (!next && formDirty) { setConfirmClose(true); return; } setAdding(next); }}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>Add a book</DialogTitle><DialogDescription>A title is enough to start. You can add details and a manuscript later. A book cannot be removed from the app yet, so add a title you mean to keep.</DialogDescription></DialogHeader><BookMetadataForm series={series} onDirtyChange={setFormDirty} onCancel={() => { if (formDirty) setConfirmClose(true); else closeAdd(); }} onSaved={book => { closeAdd(); router.push(`/universe/${book.slug}`); }} /></DialogContent></Dialog>
    <KeepEntriesDialog open={confirmClose} onKeep={() => setConfirmClose(false)} onDiscard={closeAdd} />
  </div>;
}
