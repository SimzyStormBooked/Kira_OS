"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Download, FileText, LockKeyhole, Search, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { bookDetailSchema, manuscriptFileSchema, sourceResponseSchema, searchResponseSchema, type BookDetailResponse, type LibrarySearchResult, type ManuscriptSummary } from "@/lib/manuscripts/library-contract";
import { MANUSCRIPT_EMBEDDING_MODEL, MANUSCRIPT_MAX_BYTES, manuscriptFormat, type ManuscriptFact, type ManuscriptCharacter } from "@/lib/manuscripts/contract";
import { STUDIO_MODEL } from "@/lib/ai/studio-contract";
import { readingJobSchema, type ReadingJob } from "@/lib/manuscripts/reading-job";
import { useWorkspace } from "@/lib/db/demo-store";
import { LibraryRequestError, useLibrary } from "./library-provider";
import { BookMetadataForm, KeepEntriesDialog } from "./connected-library";
import { BookKnowledge } from "./book-knowledge";
import { BookDetailsBrief } from "./book-details-brief";
const statusLabels = { uploading: "Upload needs to finish", queued: "Ready to read", processing: "Reading in progress", ready: "Knowledge ready", failed: "Reading paused — needs attention" };
// Plain names for the services that see her pages. The exact identifiers stay
// available for the record, one disclosure away, instead of leading the consent list.
const modelNames: Record<string, string> = { [STUDIO_MODEL]: "Google’s Gemini", [MANUSCRIPT_EMBEDDING_MODEL]: "OpenAI’s text index" };
const friendlyModel = (id: string) => modelNames[id] ?? id;
const fileSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ConnectedBookDetail({ initial }: { initial: BookDetailResponse }) {
  const library = useLibrary(); const { request } = library;
  const { createManualReview, ready: deskReady, canEdit: deskCanEdit, busy: deskBusy } = useWorkspace();
  const [data, setData] = useState(initial); const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false); const [confirmClose, setConfirmClose] = useState(false);
  const [polledAt, setPolledAt] = useState(0);
  const [job, setJob] = useState<ReadingJob | null>(null);
  const [uploading, setUploading] = useState(false); const [reading, setReading] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [uploadError, setUploadError] = useState(""); const [uploadMessage, setUploadMessage] = useState("");
  const [invalidFile, setInvalidFile] = useState(false); const [invalidPermission, setInvalidPermission] = useState(false);
  const [fileChoice, setFileChoice] = useState<{ name: string; size: number } | null>(null);
  const [confirmUpload, setConfirmUpload] = useState(false); const [pendingName, setPendingName] = useState("");
  const [removalFor, setRemovalFor] = useState<ManuscriptSummary | null>(null); const [recording, setRecording] = useState(false);
  const [custodyNote, setCustodyNote] = useState(""); const [custodyError, setCustodyError] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false); const [source, setSource] = useState<{ location: string; text: string } | null>(null); const [sourceError, setSourceError] = useState("");
  const [searching, setSearching] = useState(false); const [searchResults, setSearchResults] = useState<LibrarySearchResult[] | null>(null);
  const [searchAllowed, setSearchAllowed] = useState(false);
  const [savedNow, setSavedNow] = useState(""); const [progressNote, setProgressNote] = useState("");
  const readingRef = useRef(false); const mounted = useRef(true); const sourceSequence = useRef(0); const searchSequence = useRef(0);
  const announcedState = useRef(""); const announcedAt = useRef(0);
  const pendingUpload = useRef<{ form: FormData; formElement: HTMLFormElement; name: string } | null>(null);
  const uploadErrorRef = useRef<HTMLParagraphElement>(null);
  const formatNoteId = useId(); const fileInputId = useId(); const uploadErrorId = useId();
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
      if (mounted.current) { setJob(started); setSavedNow(""); setUploadMessage(""); setMessage("Your manuscript is saved. Raven will keep reading in the background. You can explore another page or close this tab."); }
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
  function failUpload(text: string) {
    setUploadError(text); requestAnimationFrame(() => uploadErrorRef.current?.focus());
  }
  // Two checks, then one plain confirmation: saving a version cannot be undone.
  function reviewUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (uploading || reading) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); const entry = form.get("file");
    setUploadError(""); setUploadMessage("");
    const chosen = entry instanceof File ? entry : null;
    const badFile = !chosen || !chosen.size || chosen.size > MANUSCRIPT_MAX_BYTES || !manuscriptFormat(chosen.name, chosen.type);
    const badPermission = form.get("permission") !== "true";
    setInvalidFile(badFile); setInvalidPermission(!badFile && badPermission);
    if (badFile || !chosen) { failUpload("Choose a DOCX, PDF, EPUB, TXT or Markdown manuscript under 4 MB."); return; }
    if (badPermission) { failUpload("Confirm your permission before uploading."); return; }
    pendingUpload.current = { form, formElement, name: chosen.name };
    setPendingName(chosen.name); setConfirmUpload(true);
  }
  async function upload() {
    const pending = pendingUpload.current;
    if (!pending || uploading || reading) return;
    setConfirmUpload(false); pending.form.set("bookId", book.id); setUploading(true);
    try {
      const saved = await request("/api/manuscripts/upload", { method: "POST", body: pending.form }) as { manuscript: { id: string; status: string }; duplicate: boolean };
      await refresh(); pending.formElement.reset(); if (mounted.current) setFileChoice(null);
      if (!mounted.current) return;
      if (saved.manuscript.status === "ready") setUploadMessage("This manuscript version is already saved and ready. No duplicate was created.");
      else if (saved.manuscript.status === "queued") { setSavedNow(saved.manuscript.id); setUploadMessage("Your manuscript is saved. Nothing has been read yet — start reading below when you are ready."); }
      else setUploadMessage("This version is already saved. Use its reading status below to continue.");
    } catch (failure) { if (mounted.current) failUpload(describeError(failure)); }
    finally { pendingUpload.current = null; if (mounted.current) setUploading(false); }
  }
  // Her own file, back out of the app: a short-lived link under the read policy she already has.
  async function download(version: ManuscriptSummary) {
    setCustodyNote(""); setCustodyError("");
    try {
      const link = manuscriptFileSchema.parse(await request(`/api/manuscripts/${version.id}/file`));
      window.open(link.url, "_blank", "noopener,noreferrer");
      if (mounted.current) setCustodyNote(`A download of ${link.filename} opened in a new tab. The link stops working after ${link.expires_in_seconds} seconds.`);
    } catch (failure) { if (mounted.current) setCustodyError(describeError(failure)); }
  }
  async function recordRemovalRequest() {
    const version = removalFor; if (!version || recording) return;
    setRecording(true); setCustodyNote(""); setCustodyError("");
    try {
      const saved = await createManualReview(`Manuscript removal request · ${book.title} · version ${version.version}`.slice(0, 200), [
        "MANUSCRIPT REMOVAL REQUEST · FOR THE WORKSPACE OWNER",
        `Book: ${book.title}\nManuscript version: ${version.version}\nFile: ${version.filename} · ${fileSize(version.size_bytes)}\nUploaded: ${new Date(version.created_at).toLocaleDateString()}\nBook page: /universe/${book.slug}`,
        "I am asking for this manuscript version to be removed: the stored file, its saved passages, their embeddings, and the book knowledge extracted from it.",
        "Removal is not built into this app. Acting on this request needs a direct database and storage change by the workspace owner. Until then the version stays readable to everyone with workspace access.",
        "Owner note and date completed:\n[Recorded here when the removal is done.]",
      ].join("\n\n"));
      if (!saved) throw new Error("save");
      if (mounted.current) { setRemovalFor(null); setCustodyNote("Your removal request is saved at Cassandra’s Desk with this version’s details. Nothing has been deleted yet."); }
    } catch { if (mounted.current) setCustodyError("Your removal request could not be saved. Your manuscript is unchanged; please try again."); }
    finally { if (mounted.current) setRecording(false); }
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
  const visibleResults = searchAllowed && searchResults ? searchResults : null;
  const resultSummary = visibleResults ? `${visibleResults.length} matching passage${visibleResults.length === 1 ? "" : "s"}${visibleResults.length ? "." : ". Try a character name or a shorter phrase."}` : "";
  if (!library.authorized) return <div className="library-page"><Card className="library-panel empty-state"><LockKeyhole size={24} /><h2>Your session ended.</h2><p role="status">Returning to sign in… Nothing you saved has been lost.</p></Card></div>;
  return <div className="library-page">
    <Link href="/universe" className="text-link back-link"><ArrowLeft size={14} />Back to The Universe</Link>
    <div className="page-heading"><div><span className="eyebrow page-kicker">{data.series.find(item => item.id === book.series_id)?.name ?? "YOUR BOOK LIBRARY"}{book.series_order ? ` / BOOK ${book.series_order}` : ""}</span><h1>{book.title}</h1><p>{book.metadata.genre || "Genre not added yet"}</p></div>{canEdit && <Button variant="outline" onClick={() => setEditing(true)} disabled={reading || uploading}>Edit book details</Button>}</div>
    <div className="library-detail-grid"><Card className="library-panel"><span className="eyebrow">THE DETAILS YOU PROVIDED</span><h2>Your book, in your words.</h2><p className="library-preserve">{book.overview || "Add your existing description whenever you’re ready."}</p>
      <p className="quiet-note">{book.data_origin === "public_verified" ? "Title and catalog details sourced from your author website." : "Author-provided details. Manuscript findings are recorded separately."}</p>
      {book.source_url && <a href={book.source_url} className="text-link" target="_blank" rel="noreferrer">View author source</a>}
      {book.metadata.audiobook_available && <div className="library-audio"><h3>Audiobook</h3><p>{book.metadata.narrator ? `Narrated by ${book.metadata.narrator}` : "Narrator not added yet"}{book.metadata.runtime_minutes ? ` · ${book.metadata.runtime_minutes} minutes` : ""}</p>{book.metadata.audio_notes && <p>{book.metadata.audio_notes}</p>}</div>}
    </Card><Card className="library-panel"><LockKeyhole size={21} /><h2>{latest ? "Bring the next version." : "Let Raven get to know this book."}</h2><p>Add your manuscript once. Raven saves reference passages, character details, and ideas you can trace back to your words.</p>
      {canEdit ? <form className="library-form" onSubmit={reviewUpload} aria-busy={uploading}>
        <p className="library-permanence">Once saved, a manuscript version stays in this workspace permanently. No one — including the workspace owner — can remove it from inside this app yet.</p>
        <div className="library-file"><label className="library-file-label" htmlFor={fileInputId}>Manuscript file</label>
          <div className="library-file-zone"><input id={fileInputId} className="library-file-input" type="file" name="file" accept=".docx,.pdf,.epub,.txt,.md" disabled={uploading || reading} aria-describedby={formatNoteId} aria-invalid={invalidFile || undefined} aria-errormessage={invalidFile ? uploadErrorId : undefined} onChange={event => { const chosen = event.target.files?.[0]; setFileChoice(chosen ? { name: chosen.name, size: chosen.size } : null); setInvalidFile(false); }} />
            <span className="library-file-action" aria-hidden="true"><Upload size={16} />{fileChoice ? "Choose a different file" : "Choose your manuscript file"}</span>
            <span className="library-file-name">{fileChoice ? `${fileChoice.name} · ${fileSize(fileChoice.size)}` : "No file chosen yet"}</span></div></div>
        <p className="quiet-note" id={formatNoteId}>DOCX, text-based PDF, EPUB, TXT or Markdown · up to 4 MB. Scanned or protected files need a text export.</p>
        <div className="library-consent"><h3>What happens to your file</h3><ul>
          <li>Stored privately in this workspace. Everyone with access to this workspace can read its passages and findings — see <Link href="/access" className="text-link">Workspace access</Link>. The member list itself is visible to the workspace owner.</li>
          <li>Passages are read by {friendlyModel(STUDIO_MODEL)} and searched with {friendlyModel(MANUSCRIPT_EMBEDDING_MODEL)}, both through Vercel’s AI Gateway, under those providers’ terms.<details className="library-models"><summary>Exact models</summary><p>{STUDIO_MODEL} · reading<br />{MANUSCRIPT_EMBEDDING_MODEL} · search index</p></details></li>
          <li>Every version you upload is kept. Removing a manuscript from inside this app is not built yet — not for you, and not for the workspace owner. You can record a dated removal request from the custody list below, and you can download any version back to your own computer.</li>
          <li>Spoilers stay hidden by default. Your manuscript is never rewritten or published.</li>
        </ul><label className="library-check"><input type="checkbox" name="permission" value="true" disabled={uploading || reading} aria-invalid={invalidPermission || undefined} aria-errormessage={invalidPermission ? uploadErrorId : undefined} onChange={() => setInvalidPermission(false)} />I have permission to upload this manuscript and to let Raven read it privately for book knowledge. This is not permission to publish or quote from it.</label></div>
        <p ref={uploadErrorRef} tabIndex={-1} id={uploadErrorId} role="alert" className="library-form-error">{uploadError}</p>
        <p role="status" className="library-success">{uploadMessage}</p>
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
      {knowledge ? <><p>These are AI-extracted findings for your review. Findings with quotations that cannot be matched exactly to the manuscript are omitted. A matching quotation does not guarantee that the interpretation is correct or that every detail was found. Marketing inferences need your judgment.</p><p className="quiet-note">Read on {new Date(knowledge.created_at).toLocaleDateString()} · by {friendlyModel(knowledge.model)} · {data.manuscripts.find(item => item.id === knowledge.manuscript_id)?.version ? `Manuscript version ${data.manuscripts.find(item => item.id === knowledge.manuscript_id)!.version}` : "Saved manuscript"}</p><details className="library-models"><summary>Exact model</summary><p>{knowledge.model}</p></details>
        <BookKnowledge key={knowledge.manuscript_id} knowledge={knowledge} citations={citations} book={book} />
      </> : <Card className="library-panel library-memory-empty"><span className="eyebrow">NOTHING READ YET</span><h3>A place for this book’s memory.</h3><p>Once Raven finishes reading, its findings and characters will appear here with the passages behind them.</p></Card>}
    </section>
    {knowledge && <Card className="library-panel"><h2>Find it in your manuscript.</h2><p>Look up a character name, phrase or topic in the current completed version. This search shows the original words and does not use AI credits.</p><form className="library-form" onSubmit={search}><label className="library-check"><input type="checkbox" checked={searchAllowed} onChange={event => { setSearchAllowed(event.target.checked); if (!event.target.checked) { searchSequence.current++; setSearchResults(null); setSearching(false); } }} />Show manuscript excerpts, which may contain spoilers.</label><div className="library-search-row"><Input name="query" aria-label="Search manuscript" minLength={2} maxLength={300} required placeholder="A character, a phrase, a moment…" /><Button disabled={!searchAllowed || searching}><Search size={15} />{searching ? "Searching…" : "Find passages"}</Button></div></form><p role="status" className="library-search-count">{resultSummary}</p><div className="library-search-results">{visibleResults?.map(result => <div className="library-search-result" key={result.chunk_id}><span className="eyebrow">{result.location}</span><p>{result.excerpt}</p><Button variant="ghost" size="sm" onClick={() => void showSource(result.manuscript_id, result.chunk_id)}>Show full passage</Button></div>)}</div></Card>}
    {data.manuscripts.length > 0 && <details className="library-history"><summary>Where your manuscript lives · {data.manuscripts.length} version{data.manuscripts.length === 1 ? "" : "s"}</summary>
      <p>Each version stays in this workspace’s private manuscript storage with the permission recorded at upload. Everyone with workspace access can read its passages and findings.</p>
      <p>Removing a manuscript from inside this app is not built yet — not for you, and not for the workspace owner. A removal request recorded here becomes a dated brief at your desk; acting on it needs a direct database and storage change. You can download any version back to your own computer at any time.</p>
      <ul className="library-custody">{data.manuscripts.map(version => <li key={version.id}><strong>Version {version.version} · {version.filename}</strong><span>{fileSize(version.size_bytes)} · Uploaded {new Date(version.created_at).toLocaleDateString()} · {statusLabels[version.status]}{version.id === knowledge?.manuscript_id ? " · findings shown above" : ""}</span>
        <div className="library-actions"><Button type="button" variant="outline" size="sm" onClick={() => void download(version)}><Download size={14} />Download this version</Button>{canEdit && <Button type="button" variant="ghost" size="sm" disabled={!deskReady || !deskCanEdit || deskBusy || recording} onClick={() => { setCustodyNote(""); setCustodyError(""); setRemovalFor(version); }}>Request removal of this version</Button>}</div></li>)}</ul>
      <p>The member who granted permission is recorded with each version. Only the workspace owner can see the workspace member list, so this page does not print names.</p>
      <p role="status" className="library-custody-note">{custodyNote}{custodyNote && <> <Link href="/desk" className="text-link">Open my Desk</Link></>}</p>
      {custodyError && <p role="alert" className="library-error">{custodyError}</p>}</details>}
    <Dialog open={confirmUpload} onOpenChange={next => { if (!next) { setConfirmUpload(false); pendingUpload.current = null; } }}><DialogContent><DialogHeader><DialogTitle>Save this manuscript version?</DialogTitle><DialogDescription>{pendingName ? `${pendingName} will be stored privately in this workspace.` : "This file will be stored privately in this workspace."}</DialogDescription></DialogHeader>
      <p className="library-permanence">Saving is permanent. A manuscript version cannot be removed from inside this app — not by you, and not by the workspace owner. Nothing is read, quoted or published by saving; reading is a separate step you start.</p>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => { setConfirmUpload(false); pendingUpload.current = null; }}>Not yet</Button><Button type="button" onClick={() => void upload()}>Save this version</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(removalFor)} onOpenChange={next => { if (!next && !recording) setRemovalFor(null); }}><DialogContent><DialogHeader><DialogTitle>Request removal of this version</DialogTitle><DialogDescription>{removalFor ? `Version ${removalFor.version} · ${removalFor.filename}` : ""}</DialogDescription></DialogHeader>
      <p className="library-permanence">This records a dated brief at Cassandra’s Desk asking the workspace owner to remove the stored file, its passages, their embeddings and the knowledge extracted from it. It is yours, timestamped and exportable. Nothing is deleted by recording it, and the version stays readable until the owner acts.</p>
      <DialogFooter><Button type="button" variant="ghost" disabled={recording} onClick={() => setRemovalFor(null)}>Cancel</Button><Button type="button" disabled={recording || !deskReady || !deskCanEdit} onClick={() => void recordRemovalRequest()}>{recording ? "Recording…" : "Record this request"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={editing} onOpenChange={next => { if (!next && editDirty) { setConfirmClose(true); return; } setEditing(next); }}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>Edit book details</DialogTitle><DialogDescription>These are your supplied details. Raven’s manuscript findings stay separate.</DialogDescription></DialogHeader><BookMetadataForm book={book} series={data.series} onDirtyChange={setEditDirty} onCancel={() => { if (editDirty) setConfirmClose(true); else setEditing(false); }} onSaved={() => { setEditDirty(false); setConfirmClose(false); setEditing(false); void refresh(); }} /></DialogContent></Dialog>
    <KeepEntriesDialog open={confirmClose} onKeep={() => setConfirmClose(false)} onDiscard={() => { setEditDirty(false); setConfirmClose(false); setEditing(false); }} />
    <Dialog open={sourceOpen} onOpenChange={open => { setSourceOpen(open); if (!open) { sourceSequence.current++; setSource(null); } }}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>{source?.location ?? "Manuscript source"}</DialogTitle><DialogDescription>Private reference text from the cited version. This may contain spoilers and is not approved marketing copy.</DialogDescription></DialogHeader>{sourceError ? <p role="alert">{sourceError}</p> : source ? <blockquote className="library-source-text">{source.text}</blockquote> : <p role="status">Opening the source passage…</p>}</DialogContent></Dialog>
  </div>;
}
