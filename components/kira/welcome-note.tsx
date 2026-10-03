"use client";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { ArrowUpRight, Pin, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const release = "2026-10-03";
const preferenceEvent = "kira:release-note-preference";
const fallback = new Map<string, boolean>();
function preferenceKey(email: string) { let hash = 0; for (const letter of email) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0; return `kira:release-note:${release}:${hash}`; }
function setDismissed(key: string, value: boolean) { fallback.set(key, value); try { localStorage.setItem(key, String(value)); } catch { /* A display preference may stay in memory. */ } window.dispatchEvent(new Event(preferenceEvent)); }
function subscribe(notify: () => void) { const storageChanged = (event: StorageEvent) => { if (event.key) fallback.delete(event.key); else fallback.clear(); notify(); }; window.addEventListener(preferenceEvent, notify); window.addEventListener("storage", storageChanged); return () => { window.removeEventListener(preferenceEvent, notify); window.removeEventListener("storage", storageChanged); }; }

export function WelcomeNote({ viewerEmail }: { viewerEmail: string }) {
  const key = preferenceKey(viewerEmail);
  const read = useCallback(() => { if (fallback.has(key)) return fallback.get(key)!; try { return localStorage.getItem(key) === "true"; } catch { return false; } }, [key]);
  const dismissed = useSyncExternalStore(subscribe, read, () => false);
  if (dismissed) return <div className="welcome-note-reopen"><Button variant="ghost" size="sm" onClick={() => setDismissed(key, false)}><Sparkles size={14} /> What’s new in KIRA</Button></div>;
  return <aside className="welcome-note" aria-labelledby="welcome-note-title">
    <Pin className="welcome-note-pin" size={21} strokeWidth={1.4} aria-hidden="true" />
    <div className="welcome-note-copy"><span className="eyebrow">A NOTE FOR YOUR RETURN · OCTOBER UPDATE</span><h2 id="welcome-note-title">Welcome back, Cassandra.</h2><p>We’ve made a little more room for your world. Here’s what’s new to explore.</p></div>
    <ul>
      <li><Link href="/characters"><strong>Your cast, front and center</strong><span>Showcase portraits. Write relationships. Keep your own notes.</span><ArrowUpRight size={14} /></Link></li>
      <li><Link href="/universe"><strong>Review your book findings</strong><span>Review findings, flag a mismatch, or withdraw a manuscript.</span><ArrowUpRight size={14} /></Link></li>
      <li><Link href="/ads"><strong>From a report to a next step</strong><span>Import your Facebook report and explore the visual dashboard.</span><ArrowUpRight size={14} /></Link></li>
      <li><Link href="/quiet-room"><strong>Take a quiet moment</strong><span>Step into the Quiet Room when you need a downshift.</span><ArrowUpRight size={14} /></Link></li>
    </ul>
    <button className="welcome-note-close" type="button" aria-label="Dismiss the welcome note" onClick={() => setDismissed(key, true)}><X size={16} /></button>
  </aside>;
}
