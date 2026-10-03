"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sourceResponseSchema } from "@/lib/manuscripts/library-contract";
import { useWorkspace } from "@/lib/db/demo-store";
import { characterGallerySchema, characterProfileInputSchema, characterSourcesSchema, type CharacterSource, type GalleryProfile, type CharacterProfileDetail } from "@/lib/characters/contract";
import { LibraryRequestError, useLibrary } from "./library-provider";

const failureText = (failure: unknown) => failure instanceof LibraryRequestError ? (failure.status === 409 ? `${failure.message} Your draft is kept. Copy any words you need before discarding the draft and reopening the latest saved version.` : failure.message) : "This change could not be saved. Your draft is still here.";
const json = (body: unknown, method = "POST") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function useCharacterDraft(key: string, label: string, initial: Record<string, string>) {
  const { formDrafts, updateFormDraft, draftStorageFailed } = useWorkspace();
  const values = formDrafts[key]?.values ?? initial;
  return { values, storageFailed: draftStorageFailed, changed: Boolean(formDrafts[key]),
    change: (field: string, value: string) => updateFormDraft(key, label, { ...values, [field]: value }),
    clear: () => updateFormDraft(key, label, null) };
}

export function CharacterDetailsForm({ profile, initialName = "", onSaved, onClose }: { profile?: GalleryProfile; initialName?: string; onSaved: (id: string) => void; onClose: () => void }) {
  const { request } = useLibrary();
  const { values, changed, change, clear, storageFailed } = useCharacterDraft(profile ? `character:${profile.id}:edit` : "character:new", profile ? `Your edits to ${profile.display_name}` : "Your new character", {
    displayName: profile?.display_name ?? initialName, aliases: profile?.aliases.join(", ") ?? "", summary: profile?.summary ?? "", expectedVersion: String(profile?.version ?? ""),
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = characterProfileInputSchema.safeParse({ displayName: values.displayName, summary: values.summary, aliases: values.aliases.split(",").map(alias => alias.trim()).filter(Boolean) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the character details."); return; }
    setBusy(true); setError("");
    try {
      const result = await request(profile ? `/api/characters/${profile.id}` : "/api/characters", json({ ...parsed.data, ...(profile ? { expectedVersion: Number(values.expectedVersion) } : {}) }, profile ? "PATCH" : "POST")) as { profile: { id: string } };
      clear(); onSaved(result.profile.id);
    } catch (failure) { setError(failureText(failure)); } finally { setBusy(false); }
  }
  return <form className="library-form" onSubmit={submit} aria-busy={busy}><fieldset className="character-fields" disabled={busy}>
    <label>Name<Input name="displayName" required maxLength={120} autoFocus value={values.displayName} onChange={event => change("displayName", event.target.value)} placeholder="How you refer to them" /></label>
    <label>Other names they go by <span className="quiet-note">Optional, separated by commas</span><Input name="aliases" maxLength={600} value={values.aliases} onChange={event => change("aliases", event.target.value)} placeholder="Nicknames, titles, a name used in another book" /></label>
    <label>Your own description <span className="quiet-note">Optional</span><Textarea name="summary" rows={4} maxLength={2000} value={values.summary} onChange={event => change("summary", event.target.value)} placeholder="What you know about them. Your words stay yours." /></label>
    <p className="quiet-note">Two characters may share a name. Book identities are linked only after you confirm them.</p>
    {changed && <p className="quiet-note">{storageFailed ? "Your browser could not keep a recovery copy. Copy these words before refreshing or closing the tab." : "Unfinished entries stay in this tab when you close the form or visit another page."}</p>}
    {error && <p role="alert" className="library-error">{error}</p>}
    <div className="library-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : profile ? "Save character" : "Add character"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{changed ? "Keep draft and close" : "Cancel"}</Button>{changed && <Button type="button" variant="ghost" disabled={busy} onClick={() => { clear(); onClose(); }}>Discard draft</Button>}</div>
  </fieldset></form>;
}

export function CharacterNoteForm({ profileId, note, onSaved, onClose }: { profileId: string; note?: CharacterProfileDetail["notes"][number]; onSaved: () => void; onClose: () => void }) {
  const { request } = useLibrary();
  const { values, changed, change, clear, storageFailed } = useCharacterDraft(`character:${profileId}:note:${note?.id ?? "new"}`, "Your character note", { kind: note?.kind ?? "author_confirmed", body: note?.body ?? "", expectedVersion: String(note?.version ?? "") });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      await request(`/api/characters/${profileId}/notes${note ? `/${note.id}` : ""}`, json({ kind: values.kind, body: values.body, ...(note ? { expectedVersion: Number(values.expectedVersion) } : {}) }, note ? "PATCH" : "POST"));
      clear(); onSaved();
    } catch (failure) { setError(failureText(failure)); } finally { setBusy(false); }
  }
  return <form className="library-form character-editor" onSubmit={submit} aria-busy={busy}><fieldset className="character-fields" disabled={busy}>
    <label>Kind of note<select value={values.kind} onChange={event => change("kind", event.target.value)}><option value="author_confirmed">Author-confirmed reference</option><option value="visual_inspiration">Visual inspiration</option></select></label>
    <label>Your character note<Textarea value={values.body} onChange={event => change("body", event.target.value)} rows={5} maxLength={4000} required /></label>
    <p className="quiet-note">These are your words. Manuscript observations remain separate and keep their original sources. Visual inspiration is never treated as evidence.</p>
    {changed && <p className="quiet-note">{storageFailed ? "Your browser could not keep a recovery copy. Copy these words before refreshing or closing the tab." : "Unfinished entries stay in this tab when you close the form or visit another page."}</p>}
    {error && <p role="alert" className="library-error">{error}</p>}
    <div className="library-actions"><Button disabled={busy || !values.body.trim()}>{busy ? "Saving…" : "Save note"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{changed ? "Keep draft and close" : "Cancel"}</Button>{changed && <Button type="button" variant="ghost" disabled={busy} onClick={() => { clear(); onClose(); }}>Discard draft</Button>}</div>
  </fieldset></form>;
}

export function CharacterRelationshipForm({ profileId, relationship, onSaved, onClose }: { profileId: string; relationship?: CharacterProfileDetail["relationships"][number]; onSaved: () => void; onClose: () => void }) {
  const { request } = useLibrary();
  const [profiles, setProfiles] = useState<GalleryProfile[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const { values, changed, change, clear, storageFailed } = useCharacterDraft(`character:${profileId}:relationship:${relationship?.id ?? "new"}`, "Your character relationship", {
    relatedProfileId: relationship?.related_profile_id ?? "", label: relationship?.label ?? "", note: relationship?.note ?? "", expectedVersion: String(relationship?.version ?? ""),
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (relationship) return;
    let active = true;
    request("/api/characters").then(result => { if (active) setProfiles(characterGallerySchema.parse(result).profiles); }).catch(() => { if (active) setLoadError("Other characters could not be opened."); });
    return () => { active = false; };
  }, [relationship, request]);
  const options = profiles?.filter(candidate => candidate.id !== profileId) ?? [];
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      if (relationship) await request(`/api/characters/relationships/${relationship.id}`, json({ label: values.label, note: values.note, expectedVersion: Number(values.expectedVersion) }, "PATCH"));
      else await request("/api/characters/relationships", json({ profileId, relatedProfileId: values.relatedProfileId, label: values.label, note: values.note }));
      clear(); onSaved();
    } catch (failure) { setError(failureText(failure)); } finally { setBusy(false); }
  }
  return <form className="library-form character-editor" onSubmit={submit} aria-busy={busy}><fieldset className="character-fields" disabled={busy}>
    {relationship
      ? <p className="quiet-note">Currently reads “{relationship.profile_name} {relationship.label} {relationship.related_profile_name}.” To change who it names, remove it and add a new one.</p>
      : <>
        {!profiles && !loadError && <p role="status">Opening your cast…</p>}
        <label>Related character<select value={values.relatedProfileId} onChange={event => change("relatedProfileId", event.target.value)} required><option value="">Choose a character</option>{options.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.display_name}</option>)}</select></label>
      </>}
    <label>How they are connected <span className="quiet-note">A short sentence, read as written</span><Input value={values.label} onChange={event => change("label", event.target.value)} maxLength={120} required placeholder="is the mother of" /></label>
    <label>More about it <span className="quiet-note">Optional</span><Textarea rows={3} maxLength={600} value={values.note} onChange={event => change("note", event.target.value)} /></label>
    <p className="quiet-note">No reverse relationship is created. If both sides should say something, add a second relationship for the other character.</p>
    {changed && <p className="quiet-note">{storageFailed ? "Your browser could not keep a recovery copy. Copy these words before refreshing or closing the tab." : "Unfinished entries stay in this tab when you close the form or visit another page."}</p>}
    {(error || loadError) && <p role="alert" className="library-error">{error || loadError}</p>}
    <div className="library-actions"><Button disabled={busy || !values.label.trim() || (!relationship && !values.relatedProfileId)}>{busy ? "Saving…" : relationship ? "Save relationship" : "Add relationship"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{changed ? "Keep draft and close" : "Cancel"}</Button>{changed && <Button type="button" variant="ghost" disabled={busy} onClick={() => { clear(); onClose(); }}>Discard draft</Button>}</div>
  </fieldset></form>;
}

export function CharacterSourceLinker({ profileId, profiles, onSaved }: { profileId?: string; profiles?: GalleryProfile[]; onSaved: () => void }) {
  const { request } = useLibrary(); const params = useSearchParams();
  const book = params.get("book"), name = params.get("name") ?? "", sourceId = params.get("source") ?? "";
  const [sources, setSources] = useState<CharacterSource[] | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const { values, changed, change, clear, storageFailed } = useCharacterDraft(`character:${profileId ?? "gallery"}:link`, "Your character identity link", { source: sourceId, profile: profileId ?? "", note: "", confirmed: "false" });
  const sourceSequence = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++sourceSequence.current;
    try {
      const result = characterSourcesSchema.parse(await request(`/api/characters/sources${book ? `?book=${encodeURIComponent(book)}` : ""}`, { signal }));
      if (!signal?.aborted && sequence === sourceSequence.current) { setSources(result.sources); setError(""); }
    } catch (failure) { if (!signal?.aborted && sequence === sourceSequence.current) setError(failureText(failure)); }
  }, [book, request]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  const selected = sources?.find(source => source.character_id === values.source);
  const targetId = profileId ?? values.profile;
  const confirmedIdentity = `${values.source}:${targetId}`;
  const targetName = profiles?.find(profile => profile.id === targetId)?.display_name;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !selected || !targetId || values.confirmed !== confirmedIdentity) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/characters/${targetId}/links`, json({ bookId: selected.book_id, characterId: selected.character_id, manuscriptId: selected.manuscript_id, confirmed: true, note: values.note }));
      clear(); setNotice("Identity link saved. Manuscript observations remain separate from your notes."); await load(); onSaved();
    } catch (failure) { setError(failureText(failure)); } finally { setBusy(false); }
  }
  const matching = sources?.filter(source => !name || source.name.toLocaleLowerCase().includes(name.toLocaleLowerCase())) ?? [];
  return <form className="library-form character-editor" onSubmit={submit} aria-busy={busy}><fieldset className="character-fields" disabled={busy}>
    <p>Choose a character recorded in a current manuscript reference, then confirm the identity yourself. A shared name never creates a link automatically.</p>
    {!sources && !error && <p role="status">Opening manuscript characters…</p>}
    {sources && !matching.length && <p className="quiet-note">No matching manuscript characters are available. Read a manuscript in <Link href="/universe">your books</Link> first, or return to Character Studio without a source filter.</p>}
    {matching.length > 0 && <>
      <label>Manuscript character<select value={values.source} onChange={event => { change("source", event.target.value); }} required><option value="">Choose a book and recorded character</option>{matching.map(source => <option key={source.character_id} value={source.character_id}>{source.book_title} · {source.name}{source.linked_profile_id ? " · already linked" : ""}</option>)}</select></label>
      {selected && <div className="character-source"><span className="eyebrow">Manuscript observation · unreviewed</span><p>{selected.observation_count} recorded observation{selected.observation_count === 1 ? "" : "s"}{selected.source_sections.length ? ` · ${selected.source_sections.slice(0, 4).join(", ")}` : ""}</p>{selected.source_chunk_ids[0] && <CharacterSourcePassage manuscriptId={selected.manuscript_id} chunkId={selected.source_chunk_ids[0]} />}<Link className="text-link" href={`/universe/${selected.book_slug}?knowledge=characters#book-knowledge`}>Open {selected.book_title} and its source passages</Link>{selected.linked_profile_id && <p>This identity already has a confirmed link. <Link className="text-link" href={`/characters/${selected.linked_profile_id}`}>Open the linked character</Link> to review or remove it.</p>}</div>}
      {!profileId && <label>Studio character<select value={values.profile} onChange={event => change("profile", event.target.value)} required><option value="">Choose an existing character</option>{profiles?.map(profile => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></label>}
      <label>Why you are linking them <span className="quiet-note">Optional</span><Textarea rows={2} maxLength={600} value={values.note} onChange={event => change("note", event.target.value)} /></label>
      <label className="library-check"><input type="checkbox" checked={values.confirmed === confirmedIdentity} disabled={!selected || !targetId || Boolean(selected.linked_profile_id)} onChange={event => change("confirmed", event.target.checked ? confirmedIdentity : "false")} />I confirm this manuscript character is the same person{targetName ? ` as ${targetName}` : " as this Studio character"}.</label>
      <div className="library-actions"><Button disabled={busy || !selected || !targetId || values.confirmed !== confirmedIdentity || Boolean(selected.linked_profile_id)}>{busy ? "Saving…" : "Confirm identity link"}</Button>{changed && <Button variant="ghost" type="button" disabled={busy} onClick={clear}>Discard link draft</Button>}</div>
    </>}
    {changed && <p className="quiet-note">{storageFailed ? "Your browser could not keep a recovery copy. Copy these words before refreshing or closing the tab." : "Unfinished entries stay in this tab when you close the form or visit another page."}</p>}
    {error && <p role="alert" className="library-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  </fieldset></form>;
}

export function CharacterSourcePassage({ manuscriptId, chunkId }: { manuscriptId: string; chunkId: string }) {
  const { request } = useLibrary();
  const [open, setOpen] = useState(false), [error, setError] = useState("");
  const [source, setSource] = useState<{ location: string; text: string } | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  async function show() {
    const current = ++sequence.current; setOpen(true); setSource(null); setError("");
    try {
      const result = sourceResponseSchema.parse(await request(`/api/manuscripts/${manuscriptId}/source?chunk=${encodeURIComponent(chunkId)}`));
      if (current === sequence.current) setSource(result.chunk);
    } catch (failure) { if (current === sequence.current) setError(failureText(failure)); }
  }
  return <><Button type="button" variant="ghost" onClick={() => void show()}>Read linked source passage</Button><Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { sequence.current++; setSource(null); } }}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>{source?.location ?? "Manuscript source"}</DialogTitle><DialogDescription>The original passage in the manuscript version used for this link. It may contain spoilers. This is reference material, not an author note.</DialogDescription></DialogHeader>{error ? <p role="alert">{error}</p> : source ? <blockquote className="library-source-text">{source.text}</blockquote> : <p role="status">Opening the source passage…</p>}</DialogContent></Dialog></>;
}
