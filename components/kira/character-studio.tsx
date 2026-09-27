"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Image as ImageIcon, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/db/demo-store";
import { characterGallerySchema, type CharacterGallery, type GalleryProfile } from "@/lib/characters/contract";
import { LibraryRequestError, useLibrary } from "./library-provider";
import { CharacterDetailsForm, CharacterSourceLinker } from "./character-forms";
import "./characters.css";

export function CharacterStudio() {
  const { mode } = useWorkspace();
  return mode === "connected" ? <ConnectedCharacterStudio /> : <StudioPreviewNotice />;
}

function StudioPreviewNotice() {
  return <div className="character-page">
    <StudioHeading />
    <Card className="character-intro"><Users size={25} /><div>
      <h2>Character Studio opens in your private workspace.</h2>
      <p>Your characters, their portraits and your notes are kept in your own workspace, so they are not part of this shared preview. Sign in to your workspace to build your cast.</p>
      <span className="quiet-note">Nothing here is public, and an image you add is never used as evidence about your book.</span>
    </div></Card>
  </div>;
}

function StudioHeading() {
  return <div><span className="eyebrow page-kicker">YOUR PEOPLE / CHARACTER STUDIO</span>
    <h1>Your cast.<br /><em>Your likenesses.</em></h1>
    <p>One place for the people in your books: what you have confirmed, how you picture them, and where they appear.</p></div>;
}

function CharacterCover({ profile }: { profile: GalleryProfile }) {
  if (profile.cover?.url) {
    // A signed, short-lived URL for a private object, not a public address. The image
    // optimizer is deliberately bypassed: it would proxy and cache private portraits.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="character-cover" src={profile.cover.url} alt={profile.cover.caption ?? `Portrait of ${profile.display_name}`} loading="lazy" />;
  }
  const initials = profile.display_name.split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toLocaleUpperCase();
  return <div className="character-cover character-cover-empty" aria-hidden="true"><span>{initials || "?"}</span></div>;
}

function ConnectedCharacterStudio() {
  const { request } = useLibrary(); const router = useRouter();
  const { formDrafts } = useWorkspace();
  const [data, setData] = useState<CharacterGallery | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [adding, setAdding] = useState(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    if (!mounted.current) return;
    setLoading(true); setError("");
    try { const result = characterGallerySchema.parse(await request("/api/characters")); if (mounted.current) setData(result); }
    catch (failure) { if (mounted.current) setError(failure instanceof LibraryRequestError ? failure.message : "Your Character Studio could not be reached."); }
    finally { if (mounted.current) setLoading(false); }
  }, [request]);
  // Deferred like the library provider: an effect must not set state synchronously.
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(load);
    return () => { mounted.current = false; };
  }, [load]);
  const profiles = data?.profiles ?? [];
  const term = query.trim().toLocaleLowerCase();
  // Aliases are searchable, because a reader's name for someone is often not the author's.
  const matches = profiles.filter(profile => !term
    || profile.display_name.toLocaleLowerCase().includes(term)
    || profile.aliases.some(alias => alias.toLocaleLowerCase().includes(term)));
  const editable = data?.role !== "viewer";
  return <div className="character-page">
    <div className="page-heading"><StudioHeading />
      {data && editable && <Button onClick={() => setAdding(true)}><Plus size={16} /> {formDrafts["character:new"] ? "Resume new character" : "Add character"}</Button>}</div>
    {loading && !data && <p role="status">Opening your Character Studio…</p>}
    {error && <div role="alert" className="library-error"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
    {data && <>
      {profiles.length > 0 && <div className="catalog-toolbar"><div className="catalog-search"><Search size={15} />
        <Input aria-label="Search characters by name or alias" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a character…" /></div>
        <span className="quiet-note">{profiles.length} {profiles.length === 1 ? "character" : "characters"}</span></div>}
      <div className="character-grid">{matches.map(profile => <Link key={profile.id} href={`/characters/${profile.id}`} className="character-card">
        <CharacterCover profile={profile} />
        <div className="character-card-info">
          <h3>{profile.display_name}<ArrowUpRight size={17} /></h3>
          {profile.aliases.length > 0 && <span className="eyebrow">{profile.aliases.slice(0, 3).join(" · ")}</span>}
          <span className="character-meta">
            <ImageIcon size={14} /> {profile.portrait_count} {profile.portrait_count === 1 ? "portrait" : "portraits"}
            {profile.book_count > 0 && <> · {profile.book_count} {profile.book_count === 1 ? "book" : "books"}</>}
          </span>
        </div>
      </Link>)}</div>
      {!matches.length && <div className="empty-state"><Users size={30} />
        <h2>{profiles.length ? "No character found." : "Your cast starts here."}</h2>
        <p>{profiles.length ? "Try another name or one of their other names." : "Add a character, then keep their portraits and your notes in one place. Nothing is published, and an image is never treated as proof of a fact in your book."}</p>
        {profiles.length > 0 && <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>}</div>}
      {editable && <section className="character-section" aria-labelledby="link-source-heading"><h2 id="link-source-heading">Connect a manuscript character</h2><Suspense fallback={<p>Opening source choices…</p>}><CharacterSourceLinker profiles={profiles} onSaved={() => void load()} /></Suspense></section>}
      <p className="catalog-footnote">Portraits stay private to your workspace and open through short-lived private links. Location details in an image file are removed before it is kept.</p>
    </>}
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="library-dialog" aria-labelledby="add-character-title">
      <DialogHeader><DialogTitle id="add-character-title">Add a character</DialogTitle>
        <DialogDescription>A name is enough to start. Portraits, notes and book links come next.</DialogDescription></DialogHeader>
      <CharacterDetailsForm onClose={() => setAdding(false)} onSaved={id => { setAdding(false); const search = new URLSearchParams(window.location.search); router.push(`/characters/${id}${search.size ? `?${search.toString()}` : ""}`); }} />
    </DialogContent></Dialog>
  </div>;
}
