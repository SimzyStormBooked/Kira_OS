"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Check, Image as ImageIcon, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/db/demo-store";
import { PORTRAIT_MAX_BYTES, characterProfileDetailSchema, portraitFormat, type CharacterProfileDetail, type GalleryPortrait } from "@/lib/characters/contract";
import { LibraryRequestError, useLibrary } from "./library-provider";
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
  const [promotional, setPromotional] = useState(false);
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
      onAdded();
    } catch (failure) { setError(failure instanceof LibraryRequestError ? failure.message : "This portrait could not be kept. Nothing was stored."); }
    finally { setBusy(false); }
  }
  return <form className="library-form portrait-form" onSubmit={submit} aria-busy={busy}>
    <label>Portrait image<input ref={input} type="file" name="file" accept="image/png,image/jpeg,image/webp" required /></label>
    <label>What this image is <span className="quiet-note">Optional</span><Input name="caption" maxLength={300} placeholder="Reference board, commissioned art, a mood photo" /></label>
    <label className="library-check"><input type="checkbox" checked={promotional} onChange={event => setPromotional(event.target.checked)} />
      I have permission to use this image publicly, not only as private reference</label>
    {promotional && <label>Where it came from and who may use it<Input name="sourceCredit" maxLength={300} required placeholder="Illustrator, licence or written permission" /></label>}
    <p className="quiet-note">Location details in the file are removed before the image is kept. It stays private to your workspace, and it is never used as proof of a fact in your book.</p>
    {error && <p role="alert" className="library-error">{error}</p>}
    {removed && <p role="status" className="portrait-cleaned"><ShieldCheck size={15} /> Kept privately{removed.length ? `, after removing ${removed.join(", ")}` : ", and it carried no hidden details"}.</p>}
    <div className="library-actions"><Button type="submit" disabled={busy}>{busy ? "Preparing…" : <><Upload size={16} /> Add portrait</>}</Button></div>
  </form>;
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
    void Promise.resolve().then(load);
    return () => { mounted.current = false; };
  }, [load]);
  async function chooseCover(portraitId: string) {
    if (!data) return;
    setSaving(portraitId);
    try {
      await request(`/api/characters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryPortraitId: portraitId, expectedVersion: data.profile.version }) });
      await load();
    } catch (failure) { setError(failure instanceof LibraryRequestError ? failure.message : "That change was not saved."); }
    finally { setSaving(""); }
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
      </div></div>

      <section aria-labelledby="portraits-heading" className="character-section">
        <h2 id="portraits-heading"><ImageIcon size={18} /> Portraits</h2>
        {data.portraits.length > 0
          ? <div className="portrait-grid">{data.portraits.map(portrait => <PortraitFigure key={portrait.id} portrait={portrait}
              name={profile.display_name} isCover={portrait.id === profile.primary_portrait_id} canEdit={Boolean(canEdit)}
              onChoose={() => void chooseCover(portrait.id)} />)}</div>
          : <p className="quiet-note">No portraits yet. How you picture someone is yours to keep, and it stays private.</p>}
        {canEdit && <PortraitUpload profileId={id} onAdded={() => void load()} />}
      </section>

      <section aria-labelledby="notes-heading" className="character-section">
        <h2 id="notes-heading"><Sparkles size={18} /> Author notes</h2>
        {data.notes.length > 0
          ? <ul className="character-notes">{data.notes.map(note => <li key={note.id}>
              <span className="eyebrow">{note.kind === "author_confirmed" ? "Author-confirmed reference" : "Visual inspiration"}</span>
              <p>{note.body}</p></li>)}</ul>
          : <p className="quiet-note">Character note editing is coming later. For now, <Link className="text-link" href="/desk">save a character reference note at your Desk</Link> and include the character’s name. Your notes stay separate from manuscript findings.</p>}
      </section>

      <section aria-labelledby="books-heading" className="character-section">
        <h2 id="books-heading"><BookOpen size={18} /> Where they appear</h2>
        {data.links.length > 0
          ? <ul className="character-links">{data.links.map(link => <li key={link.id}>
              <strong>{link.book_title ?? "A book in your workspace"}</strong>
              {link.character_name && <span className="quiet-note"> as {link.character_name}</span>}
              {link.note && <p>{link.note}</p>}</li>)}</ul>
          : <p className="quiet-note">Not linked to a book yet. A shared name is not proof of the same person, so each link is a decision you confirm and can undo.</p>}
      </section>
    </>}
  </div>;
}
