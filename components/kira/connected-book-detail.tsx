"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, FileText, LockKeyhole, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { bookDetailSchema, sourceResponseSchema, searchResponseSchema, type BookDetailResponse, type LibrarySearchResult, type ManuscriptSummary } from "@/lib/manuscripts/library-contract";
import { MANUSCRIPT_EMBEDDING_MODEL, MANUSCRIPT_MAX_BYTES, manuscriptFormat, type ManuscriptFact, type ManuscriptCharacter } from "@/lib/manuscripts/contract";
import { STUDIO_MODEL } from "@/lib/ai/studio-contract";
import { readingJobSchema, type ReadingJob } from "@/lib/manuscripts/reading-job";
import { LibraryRequestError, useLibrary } from "./library-provider";
import { BookMetadataForm } from "./connected-library";
import { BookKnowledge } from "./book-knowledge";
import { BookDetailsBrief } from "./book-details-brief";
const statusLabels = { uploading: "Upload needs to finish", queued: "Ready to read", processing: "Reading in progress", ready: "Knowledge ready", failed: "Reading paused — needs attention" };

export function ConnectedBookDetail({ initial }: { initial: BookDetailResponse }) {
  const library = useLibrary(); const { request } = library;
  const [data, setData] = useState(initial); const [editing, setEditing] = useState(false);
  const [polledAt, setPolledAt] = useState(0);
  const [job, setJob] = useState<ReadingJob | null>(null);
  const [uploading, setUploading] = useState(false); const [reading, setReading] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false); const [source, setSource] = useState<{ location: string; text: string } | null>(null); const [sourceError, setSourceError] = useState("");
  const [searching, setSearching] = useState(false); const [searchResults, setSearchResults] = useState<LibrarySearchResult[] | null>(null);
  const [searchAllowed, setSearchAllowed] = useState(false);
  const [savedNow, setSavedNow] = useState(""); const [progressNote, setProgressNote] = useState("");
  const readingRef = useRef(false); const mounted = useRef(true); const sourceSequence = useRef(0); const searchSequence = useRef(0);
  const announcedState = useRef(""); const announcedAt = useRef(0);
  const formatNoteId = useId();
  const book = data.book; const canEdit = data.role !== "viewer"; const knowledge = data.intelligence;
  const latest = data.manuscripts[0];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readingRef.current = false; }; }, []);
  // A breadcrumb for the first-steps checklist. It records only that a book page
  // was opened in this browser; no workspace content is stored here.
  useEffect(() => {
    try {
      window.localStorage.setItem("kira-os:visited-book:v1", "true");
      window.dispatchEvent(new StorageEvent("storage", { key: "kira-os:visited-book:v1", newValue: "true" }));
    } catch { /* The checklist simply stays unticked when storage is unavailable. */ }
  }, []);
  const refresh = useCallback(async () => {
    const detail = bookDetailSchema.parse(await request(`/api/library/${initial.book.id}`));
    if (mounted.current) setData(detail); return detail;
  }, [initial.book.id, request]);
  const describeError = (failure: unknown) => failure instanceof LibraryRequestError ? failure.message : "That step could not finish. Your saved work is still here.";
  // One short spoken sentence for the reading panel: on every state change, and
  // otherwise no more than once every twenty seconds while passages are read.
  const announceProgress = useCallback((summary: ManuscriptSummary | undefined, jobState: string) => {
    if (!summary || !mounted.current) return;
    const state = `${summary.status}:${jobState}`; const now = Date.now();
    if (state === announcedState.current && now - announcedAt.current < 20000) return;
    announcedState.current = state; announcedAt.current = now;
    setProgressNote(`${summary.completed_chunks} of ${summary.chunk_count} passages read.`);
  }, []);
  const loadJob = useCallback(async (id: string) => {
    const result = await request(`/api/manuscripts/${id}/reading`) as { job: unknown };
    const saved = readingJobSchema.nullable().parse(result.job);
    if (mounted.current) { setJob(saved); setPolledAt(Date.now()); }
    return saved;
  }, [request]);
  useEffect(() => {
    if (!latest?.id || latest.status === "ready") return;
    let cancelled = false;
    async function poll() {
      try {
        const saved = await loadJob(latest.id);
        if (!cancelled && saved) { const detail = await refresh(); if (!cancelled) announceProgress(detail.manuscripts[0], saved.state); }
      } catch { /* A temporary connection failure must not stop the server reader. */ }
    }
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [latest?.id, latest?.status, loadJob, refresh, announceProgress]);
  async function readManuscript(id: string, retry: boolean) {
    if (readingRef.current) return;
    readingRef.current = true; setReading(true); setError(""); setMessage("");
    try {
      const response = await request(`/api/manuscripts/${id}/reading`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", retry }) }) as { job: unknown };
      const started = readingJobSchema.nullable().parse(response.job);
      if (mounted.current) { setJob(started); setSavedNow(""); setMessage("Your manuscript is saved. Raven will keep reading in the background. You can explore another page or close this tab."); }
      const detail = await refresh(); announceProgress(detail.manuscripts[0], started?.state ?? "none");
    } catch (failure) { if (mounted.current) { setError(describeError(failure)); await refresh().catch(() => {}); } }
    finally { readingRef.current = false; if (mounted.current) setReading(false); }
  }
  async function pauseReading(id: string) {
    setReading(true); setError("");
    try {
      const response = await request(`/api/manuscripts/${id}/reading`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause" }) }) as { job: unknown };
      setJob(readingJobSchema.nullable().parse(response.job)); setMessage("Reading paused. Any passages already being read will finish and stay saved. Resume whenever you are ready.");
    } catch (failure) { setError(describeError(failure)); }
    finally { setReading(false); }
  }
  const activeJob = job?.manuscript_id === latest?.id && (job?.state === "queued" || job?.state === "running");
  const stalledJob = activeJob && polledAt - Date.parse(job.updated_at) > 180000;
  const readyToStart = Boolean(latest && savedNow === latest.id && !job && latest.status === "queued");
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
      else if (saved.manuscript.status === "queued") { setSavedNow(saved.manuscript.id); setMessage("Your manuscript is saved. Nothing has been read yet — start reading below when you are ready."); }
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
    return <div className="library-citations">{item.citations.map((citation, index) => <Button key={`${citation.chunk_id}:${index}`} type="button" variant="ghost" size="sm" onClick={() => void showSource(knowledge!.manuscript_id, citation.chunk_id)}><FileText size={13} /> Read supporting passage {item.citations.length > 1 ? index + 1 : ""}</Button>)}</div>;
  }
  if (!library.authorized) return <p role="status">Returning to sign in…</p>;
  return <div className="library-page">
    <Link href="/universe" className="text-link back-link"><ArrowLeft size={14} />Back to The Universe</Link>
    <div className="page-heading"><div><span className="eyebrow page-kicker">{data.series.find(item => item.id === book.series_id)?.name ?? "YOUR BOOK LIBRARY"}{book.series_order ? ` / BOOK ${book.series_order}` : ""}</span><h1>{book.title}</h1><p>{book.metadata.genre || <>Genre not added yet{canEdit && <> · <button type="button" className="text-link" onClick={() => setEditing(true)}>Edit book details</button></>}</>}</p></div>{canEdit && <Button variant="outline" onClick={() => setEditing(true)} disabled={reading || uploading}>Edit book details</Button>}</div>
    <div className="library-detail-grid"><Card className="library-panel"><span className="eyebrow">THE DETAILS YOU PROVIDED</span><h2>Your book, in your words.</h2><p className="library-preserve">{book.overview || "Add your existing description whenever you’re ready."}</p>
      <p className="quiet-note">{book.data_origin === "public_verified" ? "Title and catalog details sourced from your author website." : "Author-provided details. Manuscript findings are recorded separately."}</p>
      {book.source_url && <a href={book.source_url} className="text-link" target="_blank" rel="noreferrer">View author source</a>}
      {book.metadata.audiobook_available && <div className="library-audio"><h3>Audiobook</h3><p>{book.metadata.narrator ? `Narrated by ${book.metadata.narrator}` : "Narrator not added yet"}{book.metadata.runtime_minutes ? ` · ${book.metadata.runtime_minutes} minutes` : ""}</p>{book.metadata.audio_notes && <p>{book.metadata.audio_notes}</p>}</div>}
    </Card><Card className="library-panel"><LockKeyhole size={21} /><h2>{latest ? "Bring the next version." : "Let Raven get to know this book."}</h2><p>Add your manuscript once. Raven saves reference passages, character details, and ideas you can trace back to your words.</p>
      {canEdit ? <form className="library-form" onSubmit={upload} aria-busy={uploading}><label>Manuscript file<Input type="file" name="file" accept=".docx,.pdf,.epub,.txt,.md" required disabled={uploading || reading} aria-describedby={formatNoteId} /></label><p className="quiet-note" id={formatNoteId}>DOCX, text-based PDF, EPUB, TXT or Markdown · up to 4 MB. Scanned or protected files need a text export.</p>
        <div className="library-consent"><h3>What happens to your file</h3><ul>
          <li>Stored privately in this workspace. Everyone with access to this workspace can read its passages and findings — see <Link href="/access" className="text-link">Workspace access</Link>.</li>
          <li>Passages are sent through Vercel AI Gateway to {STUDIO_MODEL} for reading and {MANUSCRIPT_EMBEDDING_MODEL} for search, under those providers’ terms.</li>
          <li>Every version you upload is kept. Removing a manuscript from the app isn’t available yet — ask your workspace owner if you need a file removed.</li>
          <li>Spoilers stay hidden by default. Your manuscript is never rewritten or published.</li>
        </ul><label className="library-check"><input type="checkbox" name="permission" value="true" required disabled={uploading || reading} />I have permission to upload this manuscript and to let Raven read it privately for book knowledge. This is not permission to publish or quote from it.</label></div>
        <Button disabled={uploading || reading}><BookOpen size={16} />{uploading ? "Saving manuscript…" : "Save manuscript"}</Button><p className="quiet-note">Saving stores the file only. Reading is a separate step that you start, and you can pause it.</p></form> : <p className="quiet-note">An owner or editor can add or update manuscripts.</p>}
    </Card></div>
    <Card className="library-panel"><h2>Bring a business question to your desk.</h2><p>Collect approved details, source links and questions in a review brief. Your existing unfinished brief stays protected.</p><BookDetailsBrief book={book} seriesName={data.series.find(item => item.id === book.series_id)?.name ?? "Standalone"} /></Card>
    {error && <p role="alert" className="library-error">{error}</p>}{message && <p role="status" className="library-success">{message}</p>}
    {latest && <Card className="library-panel library-progress"><div><span className="eyebrow">MANUSCRIPT VERSION {latest.version}</span><h2>{latest.status === "ready" ? statusLabels.ready : job?.state === "paused" ? "Reading paused" : job?.state === "needs_attention" || stalledJob ? "Reading needs attention" : activeJob ? "Reading in the background" : statusLabels[latest.status]}</h2><p>{latest.filename} · {latest.completed_chunks} of {latest.chunk_count} passages read</p>{latest.chunk_count > 0 && <progress aria-label="Manuscript reading progress" aria-valuetext={`${latest.completed_chunks} of ${latest.chunk_count} passages read`} max={latest.chunk_count} value={latest.completed_chunks} />}<p role="status" className="library-progress-status">{progressNote}</p>
      {readyToStart && <p className="quiet-note">Uses workspace AI credits. You can pause any time.</p>}
      {knowledge && latest.id !== knowledge.manuscript_id && <p className="quiet-note">The previous completed version remains available below until this version is ready.</p>}
      {latest.error_code && <p className="quiet-note">{latest.error_code === "storage_error" ? "Select the same file above to finish the upload." : latest.error_code === "invalid_output" ? "Your upload is saved. Raven could not verify the last AI response against your manuscript. Retry unfinished reading below; you do not need to upload again. Retrying can use AI credits." : "The last step did not complete. Retrying can use AI credits; finished passages will not be repeated."}</p>}
      {activeJob && !stalledJob && <p className="quiet-note">Your upload is saved. You can leave this screen or close the tab. Raven is reading up to two passage groups at a time; progress is saved as each finishes.</p>}
      {job?.state === "paused" && <p className="quiet-note">Paused. A group already in progress may still finish. Resume below when ready.</p>}
      {(job?.state === "needs_attention" || stalledJob) && <p className="quiet-note">{job?.error_code === "daily_limit" ? "Today’s workspace reading limit has been reached. Resume tomorrow." : "Reading needs a retry. Your file and completed passages are safe. Retrying unfinished work can use AI credits."}</p>}
    </div><div className="library-actions">{canEdit && latest.chunk_count > 0 && latest.status !== "ready" && (!activeJob || stalledJob) && <Button disabled={uploading || reading} onClick={() => void readManuscript(latest.id, !readyToStart)}>{reading ? "Starting background reading…" : readyToStart ? "Start reading with Raven" : latest.status === "failed" || job?.state === "needs_attention" || stalledJob ? "Retry unfinished reading" : "Resume reading"}</Button>}{canEdit && activeJob && !stalledJob && <Button variant="outline" disabled={reading} onClick={() => void pauseReading(latest.id)}>Pause reading</Button>}</div></Card>}
    <section className="library-knowledge"><div className="section-heading"><div><span className="eyebrow">YOUR BOOK, WITH SOURCES</span><h2>What Raven learned</h2></div><Sparkles size={23} /></div>
      {knowledge ? <><p>These are AI-extracted findings for your review. Findings with quotations that cannot be matched exactly to the manuscript are omitted. A matching quotation does not guarantee that the interpretation is correct or that every detail was found. Marketing inferences need your judgment.</p><p className="quiet-note">Read on {new Date(knowledge.created_at).toLocaleDateString()} · {knowledge.model} · {data.manuscripts.find(item => item.id === knowledge.manuscript_id)?.version ? `Manuscript version ${data.manuscripts.find(item => item.id === knowledge.manuscript_id)!.version}` : "Saved manuscript"}</p>
        <BookKnowledge key={knowledge.manuscript_id} knowledge={knowledge} citations={citations} book={book} />
      </> : <Card className="library-panel"><BookOpen size={24} /><h3>A place for this book’s memory.</h3><p>Once Raven finishes reading, its findings and characters will appear here with the passages behind them.</p></Card>}
    </section>
    {knowledge && <Card className="library-panel"><h2>Find it in your manuscript.</h2><p>Look up a character name, phrase or topic in the current completed version. This search shows the original words and does not use AI credits.</p><form className="library-form" onSubmit={search}><label className="library-check"><input type="checkbox" checked={searchAllowed} onChange={event => { setSearchAllowed(event.target.checked); if (!event.target.checked) { searchSequence.current++; setSearchResults(null); setSearching(false); } }} />Show manuscript excerpts, which may contain spoilers.</label><div className="library-search-row"><Input name="query" aria-label="Search manuscript" minLength={2} maxLength={300} required placeholder="A character, a phrase, a moment…" /><Button disabled={!searchAllowed || searching}><Search size={15} />{searching ? "Searching…" : "Find passages"}</Button></div></form><div role="status" className="library-search-results">{searchAllowed && searchResults && <><p>{searchResults.length} matching passage{searchResults.length === 1 ? "" : "s"}{searchResults.length ? "." : ". Try a character name or a shorter phrase."}</p>{searchResults.map(result => <div className="library-search-result" key={result.chunk_id}><span className="eyebrow">{result.location}</span><p>{result.excerpt}</p><Button variant="ghost" size="sm" onClick={() => void showSource(result.manuscript_id, result.chunk_id)}>Show full passage</Button></div>)}</>}</div></Card>}
    {data.manuscripts.length > 0 && <details className="library-history"><summary>Where your manuscript lives · {data.manuscripts.length} version{data.manuscripts.length === 1 ? "" : "s"}</summary>
      <p>Each version stays in this workspace’s private manuscript storage with the permission recorded at upload. Everyone with workspace access can read its passages and findings.</p>
      <ul className="library-custody">{data.manuscripts.map(version => <li key={version.id}><strong>Version {version.version} · {version.filename}</strong><span>Uploaded {new Date(version.created_at).toLocaleDateString()} · {statusLabels[version.status]}{version.id === knowledge?.manuscript_id ? " · findings shown above" : ""}</span></li>)}</ul>
      <p>Every version you upload is kept. Removing a manuscript from the app isn’t available yet — ask your workspace owner if you need a file removed.</p>
      <p>The file size and the member who granted permission are recorded with each version but are not shown here yet.</p></details>}
    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>Edit book details</DialogTitle><DialogDescription>These are your supplied details. Raven’s manuscript findings stay separate.</DialogDescription></DialogHeader><BookMetadataForm book={book} series={data.series} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh(); }} /></DialogContent></Dialog>
    <Dialog open={sourceOpen} onOpenChange={open => { setSourceOpen(open); if (!open) { sourceSequence.current++; setSource(null); } }}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>{source?.location ?? "Manuscript source"}</DialogTitle><DialogDescription>Private reference text from the cited version. This may contain spoilers and is not approved marketing copy.</DialogDescription></DialogHeader>{sourceError ? <p role="alert">{sourceError}</p> : source ? <blockquote className="library-source-text">{source.text}</blockquote> : <p role="status">Opening the source passage…</p>}</DialogContent></Dialog>
  </div>;
}
