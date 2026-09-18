"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, FileText, LockKeyhole, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { bookDetailSchema, sourceResponseSchema, searchResponseSchema, type BookDetailResponse, type LibrarySearchResult } from "@/lib/manuscripts/library-contract";
import { MANUSCRIPT_MAX_BYTES, manuscriptFormat, type ManuscriptFact, type ManuscriptCharacter } from "@/lib/manuscripts/contract";
import { LibraryRequestError, useLibrary } from "./library-provider";
import { BookMetadataForm } from "./connected-library";
import { BookDetailsBrief } from "./book-details-brief";
const statusLabels = { uploading: "Upload needs to finish", queued: "Ready to read", processing: "Reading in progress", ready: "Knowledge ready", failed: "Reading paused — needs attention" };

export function ConnectedBookDetail({ initial }: { initial: BookDetailResponse }) {
  const library = useLibrary(); const { request } = library;
  const [data, setData] = useState(initial); const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false); const [reading, setReading] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [spoilers, setSpoilers] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false); const [source, setSource] = useState<{ location: string; text: string } | null>(null); const [sourceError, setSourceError] = useState("");
  const [searching, setSearching] = useState(false); const [searchResults, setSearchResults] = useState<LibrarySearchResult[] | null>(null);
  const [searchAllowed, setSearchAllowed] = useState(false);
  const readingRef = useRef(false); const mounted = useRef(true); const sourceSequence = useRef(0); const searchSequence = useRef(0);
  const book = data.book; const canEdit = data.role !== "viewer"; const knowledge = data.intelligence;
  const latest = data.manuscripts[0];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readingRef.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const detail = bookDetailSchema.parse(await request(`/api/library/${initial.book.id}`));
    if (mounted.current) setData(detail); return detail;
  }, [initial.book.id, request]);
  const describeError = (failure: unknown) => failure instanceof LibraryRequestError ? failure.message : "That step could not finish. Your saved work is still here.";
  async function readManuscript(id: string, retry: boolean) {
    if (readingRef.current) return;
    readingRef.current = true; setReading(true); setError(""); setMessage("");
    try {
      for (let step = 0; step < 150 && mounted.current && readingRef.current; step++) {
        const result = await request(`/api/manuscripts/${id}/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), retry: step === 0 && retry }) }) as { status: string; pending?: boolean; completedChunks: number; chunkCount: number };
        await refresh();
        if (!mounted.current) break;
        if (result.pending) { setMessage("A reading step is already running. Give it a moment, then resume here."); break; }
        if (result.status === "ready") { setMessage("Kira’s reading is saved. Explore what it learned and check the sources below."); await library.reload(); break; }
        if (result.status === "failed") break;
        // The API is sequential; a new request only starts after the last batch is durable.
      }
    } catch (failure) { if (mounted.current) { setError(describeError(failure)); await refresh().catch(() => {}); } }
    finally { readingRef.current = false; if (mounted.current) setReading(false); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (uploading || reading) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); const file = form.get("file");
    setError(""); setMessage("");
    if (!(file instanceof File) || !file.size || file.size > MANUSCRIPT_MAX_BYTES || !manuscriptFormat(file.name, file.type)) { setError("Choose a DOCX, PDF, EPUB, TXT or Markdown manuscript under 4 MB."); return; }
    if (form.get("permission") !== "true") { setError("Confirm your permission before uploading."); return; }
    form.set("bookId", book.id); setUploading(true);
    try {
      const saved = await request("/api/manuscripts/upload", { method: "POST", body: form }) as { manuscript: { id: string; status: string }; duplicate: boolean };
      await refresh(); formElement.reset();
      if (saved.manuscript.status === "ready") setMessage("This manuscript version is already saved and ready. No duplicate was created.");
      else if (saved.manuscript.status === "queued") await readManuscript(saved.manuscript.id, false);
      else setMessage("This version is already saved. Use its reading status below to continue.");
    } catch (failure) { if (mounted.current) setError(describeError(failure)); }
    finally { if (mounted.current) setUploading(false); }
  }
  async function showSource(manuscriptId: string, chunkId: string) {
    const sequence = ++sourceSequence.current; setSourceOpen(true); setSource(null); setSourceError("");
    try {
      const response = sourceResponseSchema.parse(await request(`/api/manuscripts/${manuscriptId}/source?chunk=${encodeURIComponent(chunkId)}`));
      if (mounted.current && sequence === sourceSequence.current) setSource(response.chunk);
    } catch (failure) { if (mounted.current && sequence === sourceSequence.current) setSourceError(describeError(failure)); }
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!searchAllowed || searching) return;
    const query = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    if (query.length < 2) return; const sequence = ++searchSequence.current; setSearching(true); setError("");
    try { const result = searchResponseSchema.parse(await request(`/api/library/search?bookId=${book.id}&q=${encodeURIComponent(query)}`)); if (mounted.current && sequence === searchSequence.current) setSearchResults(result.results); }
    catch (failure) { if (mounted.current && sequence === searchSequence.current) setError(describeError(failure)); }
    finally { if (mounted.current && sequence === searchSequence.current) setSearching(false); }
  }
  function citations(item: ManuscriptFact | ManuscriptCharacter) {
    return <div className="library-citations">{item.citations.map((citation, index) => <Button key={`${citation.chunk_id}:${index}`} type="button" variant="ghost" size="sm" onClick={() => void showSource(knowledge!.manuscript_id, citation.chunk_id)}><FileText size={13} /> Show source {item.citations.length > 1 ? index + 1 : ""}</Button>)}</div>;
  }
  if (!library.authorized) return <p role="status">Returning to sign in…</p>;
  return <div className="library-page">
    <Link href="/universe" className="text-link back-link"><ArrowLeft size={14} />Back to The Universe</Link>
    <div className="page-heading"><div><span className="eyebrow page-kicker">{data.series.find(item => item.id === book.series_id)?.name ?? "YOUR BOOK LIBRARY"}{book.series_order ? ` / BOOK ${book.series_order}` : ""}</span><h1>{book.title}</h1><p>{book.metadata.genre || "A little more understanding. A little more possibility."}</p></div>{canEdit && <Button variant="outline" onClick={() => setEditing(true)} disabled={reading || uploading}>Edit book details</Button>}</div>
    <div className="library-detail-grid"><Card className="library-panel"><span className="eyebrow">THE DETAILS YOU PROVIDED</span><h2>Your book, in your words.</h2><p className="library-preserve">{book.overview || "Add your existing description whenever you’re ready."}</p>
      <p className="quiet-note">{book.data_origin === "public_verified" ? "Title and catalog details sourced from your author website." : "Author-provided details. Manuscript findings are recorded separately."}</p>
      {book.source_url && <a href={book.source_url} className="text-link" target="_blank" rel="noreferrer">View author source</a>}
      {book.metadata.audiobook_available && <div className="library-audio"><h3>Audiobook</h3><p>{book.metadata.narrator ? `Narrated by ${book.metadata.narrator}` : "Narrator not added yet"}{book.metadata.runtime_minutes ? ` · ${book.metadata.runtime_minutes} minutes` : ""}</p>{book.metadata.audio_notes && <p>{book.metadata.audio_notes}</p>}</div>}
    </Card><Card className="library-panel"><LockKeyhole size={21} /><h2>{latest ? "Bring the next version." : "Let Kira get to know this book."}</h2><p>Add your manuscript once. Kira saves reference passages, character details, and ideas you can trace back to your words.</p>
      {canEdit ? <form className="library-form" onSubmit={upload} aria-busy={uploading}><label>Manuscript file<Input type="file" name="file" accept=".docx,.pdf,.epub,.txt,.md" required disabled={uploading || reading} /></label><p className="quiet-note">DOCX, text-based PDF, EPUB, TXT or Markdown · up to 4 MB. Scanned or protected files need a text export.</p><label className="library-check"><input type="checkbox" name="permission" value="true" required disabled={uploading || reading} />I have permission to upload this manuscript and have Kira’s AI services analyze it privately for book knowledge. This does not approve publishing excerpts.</label><Button disabled={uploading || reading}><BookOpen size={16} />{uploading ? "Saving and reading…" : "Upload & let Kira read"}</Button><p className="quiet-note">Reading uses workspace AI credits. It continues while this page is open. You can pause and resume; completed passages stay saved.</p></form> : <p className="quiet-note">An owner or editor can add or update manuscripts.</p>}
    </Card></div>
    <Card className="library-panel"><h2>Bring a business question to your desk.</h2><p>Collect approved details, source links and questions in a review brief. Your existing unfinished brief stays protected.</p><BookDetailsBrief book={book} seriesName={data.series.find(item => item.id === book.series_id)?.name ?? "Standalone"} /></Card>
    {error && <p role="alert" className="library-error">{error}</p>}{message && <p role="status" className="library-success">{message}</p>}
    {latest && <Card className="library-panel library-progress" aria-live="polite"><div><span className="eyebrow">MANUSCRIPT VERSION {latest.version}</span><h2>{statusLabels[latest.status]}</h2><p>{latest.filename} · {latest.completed_chunks} of {latest.chunk_count} passages read</p>{latest.chunk_count > 0 && <progress aria-label="Manuscript reading progress" max={latest.chunk_count} value={latest.completed_chunks} />}
      {knowledge && latest.id !== knowledge.manuscript_id && <p className="quiet-note">The previous completed version remains available below until this version is ready.</p>}
      {latest.error_code && <p className="quiet-note">{latest.error_code === "storage_error" ? "Select the same file above to finish the upload." : "The last step did not complete. Retrying can use AI credits; finished passages will not be repeated."}</p>}
      {!reading && latest.status === "processing" && <p className="quiet-note">A step may still be finishing. Resume when ready. If it was interrupted, wait two minutes, then retry the unfinished step.</p>}
    </div><div className="library-actions">{canEdit && latest.chunk_count > 0 && latest.status !== "ready" && !reading && <Button disabled={uploading} onClick={() => void readManuscript(latest.id, latest.status === "failed" || latest.status === "processing")}>{latest.status === "failed" ? "Retry unfinished reading" : "Resume reading"}</Button>}{reading && <Button variant="outline" onClick={() => { readingRef.current = false; setMessage("Pausing after the current passage group is saved."); }}>Pause after this step</Button>}</div></Card>}
    <section className="library-knowledge"><div className="section-heading"><div><span className="eyebrow">YOUR BOOK, WITH SOURCES</span><h2>What Kira learned</h2></div><Sparkles size={23} /></div>
      {knowledge ? <><p>These are AI-extracted findings for your review. “Manuscript-supported” means the cited passage supports the finding; it does not mean you have verified it. Marketing inferences need your judgment.</p><p className="quiet-note">Read on {new Date(knowledge.created_at).toLocaleDateString()} · {knowledge.model} · {data.manuscripts.find(item => item.id === knowledge.manuscript_id)?.version ? `Manuscript version ${data.manuscripts.find(item => item.id === knowledge.manuscript_id)!.version}` : "Saved manuscript"}</p>
        <label className="library-check library-spoilers"><input type="checkbox" checked={spoilers} onChange={event => setSpoilers(event.target.checked)} />Reveal plot details and potential spoilers</label>
        {!spoilers && <p className="quiet-note">{knowledge.facts.filter(item => item.spoiler).length + knowledge.characters.filter(item => item.spoiler).length} findings with potential spoilers are hidden.</p>}
        <div className="library-facts">{knowledge.facts.filter(item => spoilers || !item.spoiler).map((fact, index) => <Card className="library-fact" key={`${fact.citations[0].chunk_id}:${index}`}><span className="eyebrow">{fact.category.replaceAll("_", " ")}</span><span className={`library-fact-label ${fact.kind === "inference" ? "inference" : ""}`}>{fact.kind === "supported" ? "Manuscript-supported · unreviewed" : "Marketing / interpretive inference"}</span><p>{fact.statement}</p>{citations(fact)}</Card>)}</div>
        <h3 className="library-subheading">Characters, with their sources</h3><p className="quiet-note">Observations are kept with each manuscript version. Matching names in separate books are not automatically treated as the same person.</p>
        <div className="library-facts">{knowledge.characters.filter(item => spoilers || !item.spoiler).map((character, index) => <Card className="library-fact" key={`${character.name}:${index}`}><span className="eyebrow">{character.role || "Character observation"}</span><h3>{character.name}</h3>{character.aliases.length > 0 && <p className="quiet-note">Also called {character.aliases.join(", ")}</p>}<p>{character.description}</p>{character.personality && <p>{character.personality}</p>}{character.relationships && <p>{character.relationships}</p>}{character.arc && <p>{character.arc}</p>}{character.marketing_description && <p className="quiet-note">Possible marketing description, for your review: {character.marketing_description}</p>}{citations(character)}</Card>)}</div>
        {knowledge.facts.length + knowledge.characters.length === 0 && <p>No reliable findings were extracted. The manuscript passages are saved and searchable below.</p>}
      </> : <Card className="library-panel"><BookOpen size={24} /><h3>A place for this book’s memory.</h3><p>Once Kira finishes reading, its findings and characters will appear here with the passages behind them.</p></Card>}
    </section>
    {knowledge && <Card className="library-panel"><h2>Find it in your manuscript.</h2><p>Look up a character name, phrase or topic in the current completed version. This search shows the original words and does not use AI credits.</p><form className="library-form" onSubmit={search}><label className="library-check"><input type="checkbox" checked={searchAllowed} onChange={event => { setSearchAllowed(event.target.checked); if (!event.target.checked) { searchSequence.current++; setSearchResults(null); setSearching(false); } }} />Show manuscript excerpts, which may contain spoilers.</label><div className="library-search-row"><Input name="query" aria-label="Search manuscript" minLength={2} maxLength={300} required placeholder="A character, a phrase, a moment…" /><Button disabled={!searchAllowed || searching}><Search size={15} />{searching ? "Searching…" : "Find passages"}</Button></div></form>{searchAllowed && searchResults && <div aria-live="polite">{!searchResults.length && <p>No matching passages. Try a character name or a shorter phrase.</p>}{searchResults.map(result => <div className="library-search-result" key={result.chunk_id}><span className="eyebrow">{result.location}</span><p>{result.excerpt}</p><Button variant="ghost" size="sm" onClick={() => void showSource(result.manuscript_id, result.chunk_id)}>Show full passage</Button></div>)}</div>}</Card>}
    {data.manuscripts.length > 0 && <details className="library-history"><summary>Manuscript history · {data.manuscripts.length} version{data.manuscripts.length === 1 ? "" : "s"}</summary>{data.manuscripts.map(version => <p key={version.id}>Version {version.version} · {version.filename} · {statusLabels[version.status]} · {new Date(version.created_at).toLocaleDateString()}</p>)}</details>}
    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>Edit book details</DialogTitle><DialogDescription>These are your supplied details. Kira’s manuscript findings stay separate.</DialogDescription></DialogHeader><BookMetadataForm book={book} series={data.series} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh(); }} /></DialogContent></Dialog>
    <Dialog open={sourceOpen} onOpenChange={open => { setSourceOpen(open); if (!open) { sourceSequence.current++; setSource(null); } }}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>{source?.location ?? "Manuscript source"}</DialogTitle><DialogDescription>Private reference text from the cited version. This may contain spoilers and is not approved marketing copy.</DialogDescription></DialogHeader>{sourceError ? <p role="alert">{sourceError}</p> : source ? <blockquote className="library-source-text">{source.text}</blockquote> : <p role="status">Opening the source passage…</p>}</DialogContent></Dialog>
  </div>;
}
