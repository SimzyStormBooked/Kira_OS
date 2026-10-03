"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, Expand, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CharacterGallery } from "@/lib/characters/contract";

export function PublishedCastGallery({ artwork, editable, hasDraft, onCreate }: {
  artwork: CharacterGallery["publishedArtwork"]; editable: boolean; hasDraft: boolean; onCreate: (name: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const current = artwork.find(art => art.id === selected);
  if (!artwork.length) return null;
  return <section className="published-cast" aria-labelledby="published-cast-title">
    <div className="published-cast-heading"><div><span className="eyebrow">LOOK AT THE WORLD YOU’VE MADE</span><h2 id="published-cast-title">Some familiar <em>faces.</em></h2></div><p>From your published Syndicate Mafia collection. Open a portrait and take a closer look.</p></div>
    <div className="published-cast-grid">{artwork.map(art => <button type="button" className="published-cast-card" key={art.id} onClick={() => setSelected(art.id)} aria-label={`Look closer at ${art.name}`}>
      <span className="published-cast-picture">{failed.includes(art.id) ? <span className="published-art-unavailable">Artwork unavailable</span> : <Image src={art.image_url} alt={art.alt} fill sizes="(max-width: 640px) 45vw, (max-width: 1100px) 28vw, 15vw" onError={() => setFailed(value => [...value, art.id])} />}</span>
      <span className="published-cast-name">{art.name}<Expand size={15} aria-hidden="true" /></span>
    </button>)}</div>
    <p className="published-cast-footnote">These are public shop photographs, separate from your private character profiles. Add your own portraits to choose what appears on your home page.</p>
    <Dialog open={Boolean(current)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="published-art-dialog">
      <DialogHeader><DialogTitle>{current?.name}</DialogTitle><DialogDescription>{current?.collection} · Published character artwork</DialogDescription></DialogHeader>
      {current && <><div className="published-art-full">{failed.includes(current.id) ? <p>We couldn’t open this photograph. You can still view its original source below.</p> : <Image src={current.image_url} alt={current.alt} fill sizes="(max-width: 640px) 90vw, 450px" onError={() => setFailed(value => [...value, current.id])} />}</div>
        <div className="published-art-actions"><a href={current.source_url} target="_blank" rel="noopener noreferrer">View the original in your shop <ArrowUpRight size={14} /><span className="sr-only"> (opens in a new tab)</span></a>
          {editable && <Button onClick={() => { setSelected(null); onCreate(current.name); }}><Plus size={15} />{hasDraft ? "Resume your unfinished character" : "Start a private profile"}</Button>}</div>
        <p className="quiet-note">A profile starts with a name you can change. This photograph does not create book facts, link a manuscript character, or grant permission to reuse the artwork in ads.</p></>}
    </DialogContent></Dialog>
  </section>;
}
