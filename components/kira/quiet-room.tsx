"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getDailyQuote } from "@/lib/data/inspiration";
import { useWorkspace } from "@/lib/db/demo-store";
import { workspaceResumeSchema, type WorkspaceResume } from "@/lib/workspace-resume";
import { useLibrary } from "./library-provider";
import "./quiet-room.css";

/**
 * A small, optional, calm view — a place to stop scrolling, not a new destination with its
 * own goals. Nothing here is timed, scored, or produced: no manuscript editor, no fiction
 * generation, no automatic sound, no streak. It stays inside the normal workspace shell, so
 * the way back is the same nav that is always there, not a bespoke exit to remember.
 */
function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
}

function FeaturedCharacter({ showcase }: { showcase: WorkspaceResume["showcase"] }) {
  if (!showcase.length) return null;
  // A different one each day, not always the same face; still nothing that resets or expires.
  const dateKey = todayKey();
  let hash = 0; for (const character of dateKey) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const character = showcase[hash % showcase.length];
  return <Link href={`/characters/${character.id}`} className="quiet-room-character">
    {character.cover_url
      // eslint-disable-next-line @next/next/no-img-element -- private signed URL; see character-studio.tsx
      ? <img src={character.cover_url} alt="" loading="lazy" />
      : <span className="quiet-room-character-empty" aria-hidden="true">{character.display_name.slice(0, 1).toLocaleUpperCase()}</span>}
    <span>One of yours: <strong>{character.display_name}</strong></span>
  </Link>;
}

function ConnectedFeaturedCharacter() {
  const { request } = useLibrary();
  const [showcase, setShowcase] = useState<WorkspaceResume["showcase"]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(async () => {
      try { const data = workspaceResumeSchema.parse(await request("/api/workspace/resume")); if (mounted.current) setShowcase(data.showcase); }
      catch { /* Quietly omit the feature on any failure; nothing here is worth an error banner. */ }
    });
    return () => { mounted.current = false; };
  }, [request]);
  return <FeaturedCharacter showcase={showcase} />;
}

export function QuietRoom() {
  const { mode } = useWorkspace();
  const quote = getDailyQuote(`${todayKey()}-quiet-room`);
  return <div className="quiet-room">
    <Link href="/" className="back-link quiet-room-return"><ArrowLeft size={15} /> Return to Mission Control</Link>
    <main className="quiet-room-stage" aria-labelledby="quiet-room-title">
      <span className="eyebrow">A QUIET MOMENT</span>
      <h1 id="quiet-room-title">Nothing here needs a decision.</h1>
      <p className="quiet-room-note">Stay as long as you like. Leave whenever you like.</p>
      <figure className="quiet-room-quote">
        <blockquote><p>“{quote.text}”</p></blockquote>
        <figcaption>{quote.author} <span aria-hidden="true">·</span> <cite>{quote.work}</cite></figcaption>
      </figure>
      {mode === "connected" && <ConnectedFeaturedCharacter />}
      <a className="text-link quiet-room-source" href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">
        Read the source <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </main>
  </div>;
}
