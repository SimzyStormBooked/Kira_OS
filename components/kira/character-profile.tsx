"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Check, Home, Image as ImageIcon, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/db/demo-store";
import { PORTRAIT_MAX_BYTES, characterProfileDetailSchema, portraitFormat, type CharacterProfileDetail, type GalleryPortrait } from "@/lib/characters/contract";
import { LibraryRequestError, useLibrary } from "./library-provider";
import { CharacterDetailsForm, CharacterNoteForm, CharacterSourceLinker, CharacterSourcePassage, useCharacterDraft } from "./character-forms";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./characters.css";

export function CharacterProfileView({ id }: { id: string }) {
  const { mode } = useWorkspace();
  if (mode !== "connected") return <div className="character-page"><p role="status">Sign in to your workspace to open a character.</p></div>;
  return <ConnectedCharacterProfile id={id} />;
}

function PortraitUpload({ profileId, onAdded }: { profileId: string; onAdded: () => void }) {
  const { request } = useLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [removed, setRemoved] = useState<string[] | null>(null);
  const { values, changed, change, clear, storageFailed } = useCharacterDraft(`character:${profileId}:portrait`, "Your unfinished portrait details", { caption: "", sourceCredit: "", promotional: "false" });
  const promotional = values.promotional === "true";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const file = input.current?.files?.[0]; setError(""); setRemoved(null);
    if (!file) { setError("Choose an image first."); return; }
    if (!portraitFormat(file.name, file.type)) { setError("Choose a PNG, JPEG or WebP image."); return; }
    if (file.size > PORTRAIT_MAX_BYTES) { setError("Choose an image under 8 MB."); return; }
    const form = new FormData(event.currentTarget);
    form.set("profileId", profileId); form.set("permission", "true"); form.set("file", file);
    form.set("usagePermission", promotional ? "promotional_approved" : "private_reference_only");
    if (!promotional) form.delete("sourceCredit");
    setBusy(true);
    try {
      const response = await request("/api/characters/portraits", { method: "POST", body: form });
      setRemoved((response as { removed?: string[] }).removed ?? []);
      if (input.current) input.current.value = "";
      clear(); onAdded();
    } catch (failure) { setError(failure instanceof LibraryRequestError ? failure.message : "This portrait could not be kept. Nothing was stored."); }
    finally { setBusy(false); }
  }
  return <form className="library-form portrait-form" onSubmit={submit} aria-busy={busy}><fieldset className="character-fields" disabled={busy}>
    <label>Portrait image<input ref={input} type="file" name="file" accept="image/png,image/jpeg,image/webp" required /></label>
    <label>What this image is <span className="quiet-note">Optional</span><Input name="caption" value={values.caption} onChange={event => change("caption", event.target.value)} maxLength={300} placeholder="Reference board, commissioned art, a mood photo" /></label>
    <label className="library-check"><input type="checkbox" checked={promotional} onChange={event => change("promotional", String(event.target.checked))} />
      I have permission to use this image publicly, not only as private reference</label>
    {promotional && <label>Where it came from and who may use it<Input name="sourceCredit" value={values.sourceCredit} onChange={event => change("sourceCredit", event.target.value)} maxLength={300} required placeholder="Illustrator, licence or written permission" /></label>}
    <p className="quiet-note">Location details in the file are removed before the image is kept. It stays private to your workspace, and it is never used as proof of a fact in your book.</p>
    {changed && <p className="quiet-note">{storageFailed ? "Your browser could not keep a recovery copy. Copy these details before refreshing or closing the tab." : "Your portrait details are kept in this tab. If you leave, choose the image file again when you return."}</p>}
    {error && <p role="alert" className="library-error">{error}</p>}
    {removed && <p role="status" className="portrait-cleaned"><ShieldCheck size={15} /> Kept privately{removed.length ? `, after removing ${removed.join(", ")}` : ", and it carried no hidden details"}.</p>}
    <div className="library-actions"><Button type="submit" disabled={busy}>{busy ? "Preparing…" : <><Upload size={16} /> Add portrait</>}</Button></div>
  </fieldset></form>;
}

function PortraitFigure({ portrait, name, isCover, canEdit, onChoose }: {
  portrait: GalleryPortrait; name: string; isCover: boolean; canEdit: boolean; onChoose: () => void;
}) {
  return <figure className="portrait-figure">
    {portrait.url
      // eslint-disable-next-line @next/next/no-img-element -- private signed URL; see character-studio.tsx
      ? <img src={portrait.url} alt={portrait.caption ?? `Portrait of ${name}`} loading="lazy" />
      : <div className="character-cover-empty" role="img" aria-label="This portrait could not be opened right now"><span>—</span></div>}
    <figcaption>
      {portrait.caption && <span className="portrait-caption">{portrait.caption}</span>}
      <span className="portrait-permission">{portrait.usage_permission === "promotional_approved"
        ? <>Cleared for promotion{portrait.source_credit ? ` · ${portrait.source_credit}` : ""}</>
        : "Private reference only"}</span>
      {canEdit && (isCover
        ? <span className="portrait-cover-flag"><Check size={14} /> Shown on the card</span>
        : <Button type="button" variant="ghost" onClick={onChoose}>Use on the card</Button>)}
    </figcaption>
  </figure>;
}

function ConnectedCharacterProfile({ id }: { id: string }) {
  const { request } = useLibrary();
  const { formDrafts } = useWorkspace();
  const [editing, setEditing] = useState(false), [noteId, setNoteId] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [showLinker, setShowLinker] = useState(false);
  const [data, setData] = useState<CharacterProfileDetail | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saving, setSaving] = useState("");
  const mounted = useRef(true);
  const load = useCallback(async () => {
    if (!mounted.current) return;
    setLoading(true); setError("");
    try { const result = characterProfileDetailSchema.parse(await request(`/api/characters/${id}`)); if (mounted.current) setData(result); }
    catch (failure) { if (mounted.current) setError(failure instanceof LibraryRequestError ? failure.message : "This character could not be opened."); }
    finally { if (mounted.current) setLoading(false); }
  }, [request, id]);
  // Deferred like the library provider: an effect must not set state synchronously.
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => { if (new URLSearchParams(window.location.search).has("book")) setShowLinker(true); return load(); });
    return () => { mounted.current = false; };
  }, [load]);
  async function chooseCover(portraitId: string) {
    if (!data || saving) return;
    setSaving(portraitId);
    try {
      await request(`/api/characters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryPortraitId: portraitId, expectedVersion: data.profile.version }) });
      await load();
    } catch (failure) { setError(failure instanceof LibraryRequestError ? failure.message : "That change was not saved."); }
    finally { setSaving(""); }
  }
  async function toggleShowcase() {
    if (!data || saving) return;
    setSaving("showcase");
    try {
      await request(`/api/characters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeShowcasePinned: !data.profile.home_showcase_pinned_at, expectedVersion: data.profile.version }) });
      await load();
    } catch (failure) { setError(failure instanceof LibraryRequestError ? failure.message : "That change was not saved."); }
    finally { setSaving(""); }
  }
  async function unlink(linkId: string) {
    if (saving) return; setSaving(linkId);
    try { await request(`/api/characters/${id}/links`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linkId }) }); setUnlinking(null); await load(); }
    catch (failure) { setError(failure instanceof LibraryRequestError ? failure.message : "The link could not be removed."); } finally { setSaving(""); }
  }
  const profile = data?.profile;
  const canEdit = data?.role !== "viewer";
  return <div className="character-page" aria-busy={Boolean(saving)}>
    <Link href="/characters" className="back-link"><ArrowLeft size={15} /> Character Studio</Link>
    {loading && !data && <p role="status">Opening this character…</p>}
    {error && <div role="alert" className="library-error"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
    {data && profile && <>
      <div className="page-heading"><div>
        <span className="eyebrow page-kicker">CHARACTER</span>
        <h1>{profile.display_name}</h1>
        {profile.aliases.length > 0 && <p className="character-aliases">Also known as {profile.aliases.join(", ")}</p>}
        {profile.summary && <p>{profile.summary}</p>}
      </div>{canEdit && <div className="character-heading-actions">
        <Button variant={profile.home_showcase_pinned_at ? "secondary" : "outline"} disabled={saving === "showcase"} onClick={() => void toggleShowcase()}>
          <Home size={15} /> {profile.home_showcase_pinned_at ? "Shown on your home page" : "Show on your home page"}
        </Button>
        <Button variant="outline" onClick={() => setEditing(true)}>{formDrafts[`character:${id}:edit`] ? "Resume character edits" : "Edit character"}</Button>
      </div>}</div>

      <section aria-labelledby="portraits-heading" className="character-section">
        <h2 id="portraits-heading"><ImageIcon size={18} /> Portraits</h2>
        {data.portraits.length > 0
          ? <div className="portrait-grid">{data.portraits.map(portrait => <PortraitFigure key={portrait.id} portrait={portrait}
              name={profile.display_name} isCover={portrait.id === profile.primary_portrait_id} canEdit={Boolean(canEdit) && !saving}
              onChoose={() => void chooseCover(portrait.id)} />)}</div>
          : <p className="quiet-note">No portraits yet. How you picture someone is yours to keep, and it stays private.</p>}
        {canEdit && <PortraitUpload profileId={id} onAdded={() => void load()} />}
      </section>

      <section aria-labelledby="notes-heading" className="character-section">
        <h2 id="notes-heading"><Sparkles size={18} /> Author notes</h2>
        {data.notes.length > 0
          ? <ul className="character-notes">{data.notes.map(note => <li key={note.id}>
              <span className="eyebrow">{note.kind === "author_confirmed" ? "Author-confirmed reference" : "Visual inspiration"}</span>
              <p>{note.body}</p>{canEdit && <Button variant="ghost" onClick={() => setNoteId(note.id)}>{formDrafts[`character:${id}:note:${note.id}`] ? "Resume note edits" : "Edit note"}</Button>}</li>)}</ul>
          : <p className="quiet-note">Keep your confirmed details and visual inspiration here. Your notes stay separate from manuscript findings.</p>}
        {canEdit && <Button variant="outline" onClick={() => setNoteId("new")}>{formDrafts[`character:${id}:note:new`] ? "Resume note" : "Add note"}</Button>}

      </section>

      <section aria-labelledby="books-heading" className="character-section">
        <h2 id="books-heading"><BookOpen size={18} /> Where they appear</h2>
        {data.links.length > 0
          ? <ul className="character-links">{data.links.map(link => <li key={link.id}>
              <strong>{link.book_slug ? <Link className="text-link" href={`/universe/${link.book_slug}?knowledge=characters#book-knowledge`}>{link.book_title ?? "Open source book"}</Link> : link.book_title ?? "A book in your workspace"}</strong>
              {link.character_name && <span className="quiet-note"> as {link.character_name}</span>}
              {link.note && <p>{link.note}</p>}{link.source_manuscript_id && link.source_chunk_ids[0] && <CharacterSourcePassage manuscriptId={link.source_manuscript_id} chunkId={link.source_chunk_ids[0]} />}<p className="quiet-note">Identity confirmed {new Date(link.confirmed_at).toLocaleDateString()}. Source observations remain unreviewed in the book.</p>{canEdit && (unlinking === link.id ? <div className="library-actions"><span>Remove this identity link? Both records stay saved.</span><Button variant="outline" disabled={Boolean(saving)} onClick={() => void unlink(link.id)}>Confirm unlink</Button><Button variant="ghost" onClick={() => setUnlinking(null)}>Keep link</Button></div> : <Button variant="ghost" onClick={() => setUnlinking(link.id)}>Unlink book character</Button>)}</li>)}</ul>
          : <p className="quiet-note">Not linked to a book yet. A shared name is not proof of the same person, so each link is a decision you confirm and can undo.</p>}
        {canEdit && <><Button variant="outline" aria-expanded={showLinker} aria-controls="character-link-form" onClick={() => setShowLinker(value => !value)}>{showLinker ? "Close link form" : "Link a manuscript character"}</Button>{showLinker && <div id="character-link-form"><Suspense fallback={<p>Opening source choices…</p>}><CharacterSourceLinker profileId={id} onSaved={() => void load()} /></Suspense></div>}</>}
      </section>
      <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="library-dialog" aria-labelledby="edit-character-title"><DialogHeader><DialogTitle id="edit-character-title">Edit character</DialogTitle><DialogDescription>Your own names and description. Closing keeps your unfinished edits in this tab.</DialogDescription></DialogHeader><CharacterDetailsForm profile={profile} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} /></DialogContent></Dialog>
      <Dialog open={noteId !== null} onOpenChange={open => { if (!open) setNoteId(null); }}><DialogContent className="library-dialog" aria-labelledby="character-note-title"><DialogHeader><DialogTitle id="character-note-title">{noteId === "new" ? "Add character note" : "Edit character note"}</DialogTitle><DialogDescription>Author-confirmed reference and visual inspiration stay distinct.</DialogDescription></DialogHeader>{noteId && <CharacterNoteForm key={noteId} profileId={id} note={data.notes.find(note => note.id === noteId)} onClose={() => setNoteId(null)} onSaved={() => { setNoteId(null); void load(); }} />}</DialogContent></Dialog>
    </>}
  </div>;
}
