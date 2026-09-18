"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bookmark, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { inspirationCategories, inspirationIdeas, type InspirationCategory } from "@/lib/data/inspiration";
import { DailyQuote } from "./daily-quote";

type InspirationShelfProps = { dateKey?: string; onUseIdea?: () => void; showQuote?: boolean };

export function InspirationShelf({ dateKey, onUseIdea, showQuote = false }: InspirationShelfProps) {
  const [category, setCategory] = useState<InspirationCategory | "All">("All");
  const [index, setIndex] = useState(0);
  const headingId = useId();
  const ideaTitleId = useId();
  const keyboardHelpId = useId();
  const ideas = category === "All" ? inspirationIdeas : inspirationIdeas.filter((idea) => idea.category === category);
  const idea = ideas[index % ideas.length];

  function move(direction: number) {
    setIndex((current) => (current + direction + ideas.length) % ideas.length);
  }
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    // Preserve the ordinary keyboard behavior of links and buttons within the reel.
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "Home") { event.preventDefault(); setIndex(0); }
    if (event.key === "End") { event.preventDefault(); setIndex(ideas.length - 1); }
  }

  return (
    <Card className="inspiration-shelf">
      <div className="inspiration-heading">
        <span className="eyebrow"><Sparkles size={14} aria-hidden="true" /> A LITTLE ROOM TO WONDER</span>
        <h2 id={headingId}>Find your next <em>spark.</em></h2>
        <p>A few questions for your books, your readers, and whatever comes next.</p>
      </div>
      <div className="inspiration-filters" role="group" aria-label="Filter inspiration ideas">
        {(["All", ...inspirationCategories] as const).map((filter) => (
          <button key={filter} type="button" className={`inspiration-filter${category === filter ? " is-active" : ""}`} aria-pressed={category === filter} onClick={() => { setCategory(filter); setIndex(0); }}>
            {filter}
          </button>
        ))}
      </div>
      <span className="sr-only" id={keyboardHelpId}>Use the previous and next buttons, or focus this card and press the arrow keys, to browse ideas.</span>
      <div className="inspiration-reel" role="region" aria-roledescription="carousel" aria-labelledby={headingId} aria-describedby={keyboardHelpId} tabIndex={0} onKeyDown={handleKeys}>
        <article aria-labelledby={ideaTitleId}>
          <span className="inspiration-category"><Bookmark size={12} aria-hidden="true" /> {idea.category} <span aria-hidden="true">/</span> {idea.editorialLabel}</span>
          <h3 id={ideaTitleId}>{idea.title}</h3>
          <p className="inspiration-prompt">{idea.prompt}</p>
          <div className="inspiration-first-step"><span className="eyebrow">A SMALL FIRST STEP</span><p>{idea.firstStep}</p></div>
          <Button asChild><Link href={`/desk?idea=${encodeURIComponent(idea.id)}`} onNavigate={onUseIdea}>Use this idea <ArrowRight size={14} aria-hidden="true" /></Link></Button>
        </article>
      </div>
      <div className="inspiration-controls">
        <Button type="button" variant="ghost" size="sm" onClick={() => move(-1)} aria-label="Previous idea"><ArrowLeft size={15} aria-hidden="true" /> Previous</Button>
        <p className="inspiration-position" aria-live="polite" aria-atomic="true">{index + 1} / {ideas.length}<span className="sr-only"> · {idea.title}</span></p>
        <Button type="button" variant="ghost" size="sm" onClick={() => move(1)} aria-label="Next idea">Next <ArrowRight size={15} aria-hidden="true" /></Button>
      </div>
      <p className="inspiration-note">Opens a brief you can make your own. Save it when you’re ready.</p>
      {showQuote ? <DailyQuote dateKey={dateKey} compact /> : null}
    </Card>
  );
}

export function InspirationDialogTrigger({ dateKey }: { dateKey?: string }) {
  const [open, setOpen] = useState(false);
  const navigationClose = useRef(false);
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) navigationClose.current = false;
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild><Button variant="outline" className="inspiration-trigger" aria-label="Find a spark"><Sparkles size={15} aria-hidden="true" /><span>Find a spark</span></Button></DialogTrigger>
      <DialogContent className="inspiration-dialog" onCloseAutoFocus={(event) => {
        if (!navigationClose.current) return;
        // The destination form owns focus after navigation. Ordinary dismissals
        // still use Radix's default return to the Find a spark trigger.
        event.preventDefault();
        navigationClose.current = false;
      }}>
        <DialogHeader className="sr-only"><DialogTitle>A little inspiration</DialogTitle><DialogDescription>Browse curated reflections and choose an idea to develop into a business brief.</DialogDescription></DialogHeader>
        <InspirationShelf dateKey={dateKey} onUseIdea={() => {
          navigationClose.current = true;
          setOpen(false);
        }} showQuote />
      </DialogContent>
    </Dialog>
  );
}
