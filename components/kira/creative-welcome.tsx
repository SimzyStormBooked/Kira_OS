"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Feather, ImageIcon, Leaf, LockKeyhole, Pause, Play, Sparkles, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceResume } from "@/lib/workspace-resume";

type Slide = { id: string; name: string; url: string; alt: string; private: boolean; href: string; collection: string };
const motionQuery = "(prefers-reduced-motion: reduce)";
function motionSubscribe(notify: () => void) { const query = window.matchMedia(motionQuery); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); }
function motionSnapshot() { return window.matchMedia(motionQuery).matches; }

export function CreativeWelcome({ data, loading }: { data: WorkspaceResume | null; loading: boolean }) {
  const own = data?.showcase.filter(character => character.cover_url).map(character => ({
    id: character.id, name: character.display_name, url: character.cover_url!, alt: `Your portrait of ${character.display_name}`,
    private: true, href: `/characters/${character.id}`, collection: "Your Character Studio",
  })) ?? [];
  const slides: Slide[] = own.length ? own : (data?.artwork ?? []).map(art => ({
    id: art.id, name: art.name, url: art.image_url, alt: art.alt, private: false, href: art.source_url, collection: art.collection,
  }));
  const identity = slides.map(slide => slide.id).join(":");
  return <WelcomeStage key={identity} slides={slides} loading={loading} hasSavedWork={Boolean(data?.books.length || data?.answer)} />;
}

function WelcomeStage({ slides, loading, hasSavedWork }: { slides: Slide[]; loading: boolean; hasSavedWork: boolean }) {
  const reducedMotion = useSyncExternalStore(motionSubscribe, motionSnapshot, () => true);
  const [index, setIndex] = useState(0);
  const [play, setPlay] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const running = play && !reducedMotion && !hovered && visible && slides.length > 1;
  const slide = slides[index];
  useEffect(() => { const change = () => setVisible(document.visibilityState === "visible"); document.addEventListener("visibilitychange", change); return () => document.removeEventListener("visibilitychange", change); }, []);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setIndex(value => (value + 1) % slides.length), 12000); return () => window.clearInterval(timer); }, [running, slides.length]);
  function choose(next: number) { setPlay(false); setIndex((next + slides.length) % slides.length); }

  return <section className="creative-welcome" aria-label="Welcome to your creative workspace">
    <div className="creative-welcome-copy">
      <span className="eyebrow creative-kicker"><Sparkles size={14} aria-hidden="true" /> YOUR WORLDS. YOUR POSSIBILITIES.</span>
      <h1>Welcome home,<br /><em>Cassandra.</em></h1>
      <p className="creative-welcome-lead">Look at everything you’ve brought to life.<br />Now let’s make room for what comes next.</p>
      <p className="creative-welcome-note">Your characters, your books, and a little help with the business around them. Start wherever the energy is.</p>
      <div className="creative-welcome-actions">
        <Button asChild><Link href="/universe">Step into your universe <ArrowRight size={16} /></Link></Button>
        <Button asChild variant="outline"><Link href="/studio">Think with Raven <Feather size={16} /></Link></Button>
      </div>
      {hasSavedWork && <Link href="#continue-work" className="creative-resume-link">Continue my saved work <ArrowRight size={14} aria-hidden="true" /></Link>}
      <span className="creative-private"><LockKeyhole size={12} aria-hidden="true" /> A space of your own</span>
    </div>
    <div className="creative-art" role="region" aria-roledescription="carousel" aria-label="Your character artwork"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setPlay(false)}>
      <span className="creative-art-orbit" aria-hidden="true">✦</span>
      {slide && !unavailable.includes(slide.url) ? <div className="creative-art-image" key={slide.id}>
        {slide.private
          // Private signed images must bypass the shared image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={slide.url} alt={slide.alt} onError={() => setUnavailable(value => [...value, slide.url])} />
          : <Image src={slide.url} alt={slide.alt} fill sizes="(max-width: 700px) 90vw, 42vw" loading={index === 0 ? "eager" : "lazy"} onError={() => setUnavailable(value => [...value, slide.url])} />}
      </div> : <div className="creative-art-empty"><ImageIcon size={40} strokeWidth={1} aria-hidden="true" /><p>{loading ? "Opening your world…" : slide ? "This artwork couldn’t be opened. Try another, or refresh your saved work below." : "A place for the faces you know by heart."}</p><Link href="/characters">Add your character portraits <ArrowUpRight size={14} /></Link></div>}
      {slide && <div className="creative-art-caption" aria-live={running ? "off" : "polite"} aria-atomic="true">
        <span><small>{slide.collection}</small><strong>{slide.name}</strong></span>
        {slide.private ? <Link href={slide.href} aria-label={`Open ${slide.name}'s character profile`}><ArrowUpRight size={20} /></Link>
          : <a href={slide.href} target="_blank" rel="noopener noreferrer" aria-label={`View ${slide.name}'s published artwork source (opens in a new tab)`}><ArrowUpRight size={20} /></a>}
      </div>}
      {slides.length > 1 && <div className="creative-art-controls" role="group" aria-label="Artwork controls">
        <button type="button" onClick={() => choose(index - 1)} aria-label="Previous artwork"><ArrowLeft size={16} /></button>
        <div className="creative-art-dots">{slides.map((item, i) => <button type="button" key={item.id} onClick={() => choose(i)} aria-label={`Show ${item.name}`} aria-pressed={index === i}><span /></button>)}</div>
        <button type="button" onClick={() => choose(index + 1)} aria-label="Next artwork"><ArrowRight size={16} /></button>
        {!reducedMotion && <button type="button" className="creative-art-play" onClick={() => setPlay(value => !value)} aria-label={play ? "Pause artwork rotation" : "Play artwork rotation"}>{play ? <Pause size={14} /> : <Play size={14} />}</button>}
      </div>}
    </div>
    {slides.length > 0 && <p className="creative-art-credit">{ownCredit(slides)} <Link href="/characters">Make this space yours <ArrowUpRight size={12} /></Link></p>}
  </section>;
}
function ownCredit(slides: Slide[]) { return slides[0]?.private ? "Your chosen portraits. Change the lineup in Character Studio." : "Familiar faces from your published shop. Pin your own portraits in Character Studio to choose this lineup."; }

export function NextMoves({ data }: { data: WorkspaceResume | null }) {
  const book = data?.books.find(item => item.reading?.status === "ready");
  const moves = [
    { icon: Users, title: "Spend time with your cast", detail: "Portraits, notes, and the connections only you know.", href: "/characters", label: "Open Character Studio", color: "rose" },
    { icon: BookOpen, title: "Find a reader’s way in", detail: book ? `Explore the marketing signals in ${book.title}.` : "Explore your books’ themes and reader appeal.", href: book ? `/universe/${book.slug}?knowledge=readers#book-knowledge` : "/universe", label: "Explore book marketing", color: "gold" },
    { icon: TrendingUp, title: "Make your next ad move", detail: "Bring in a Facebook report. See the patterns and possible next steps.", href: "/ads", label: "Open your ad dashboard", color: "green" },
    { icon: Leaf, title: "Let the noise settle", detail: "A quiet corner for a breath between decisions.", href: "/quiet-room", label: "Take a quiet moment", color: "violet" },
  ];
  return <section className="creative-next" aria-labelledby="creative-next-title">
    <div className="creative-section-heading"><div><span className="eyebrow">FOLLOW A LITTLE CURIOSITY</span><h2 id="creative-next-title">What feels right <em>today?</em></h2></div><Link href="/learn" className="text-link">Learn something new <ArrowUpRight size={14} /></Link></div>
    <div className="creative-next-grid">{moves.map(move => <Link href={move.href} className={`creative-next-card creative-next-card--${move.color}`} key={move.href}>
      <span className="creative-next-icon"><move.icon size={21} strokeWidth={1.4} aria-hidden="true" /></span><h3>{move.title}</h3><p>{move.detail}</p><span className="creative-next-link">{move.label}<ArrowUpRight size={14} aria-hidden="true" /></span>
    </Link>)}</div>
  </section>;
}
