"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Check, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/db/demo-store";
import { useLibrary } from "./library-provider";
import "./daily-workspace.css";

const preferenceKey = "kira-os:guide-dismissed:v1";
const preferenceEvent = "kira-os:guide-preference";
// Only an optional display preference lives here. Workspace data never enters
// this storage key; the in-memory fallback also works when storage is disabled.
let sessionPreference: boolean | undefined;

function readPreference() {
  if (sessionPreference !== undefined) return sessionPreference;
  try {
    return window.localStorage.getItem(preferenceKey) === "true";
  } catch {
    return false;
  }
}

function changePreference(dismissed: boolean) {
  if (typeof window === "undefined") return;
  sessionPreference = dismissed;
  try {
    window.localStorage.setItem(preferenceKey, String(dismissed));
  } catch {
    // Hiding optional guidance should still work for this visit.
  }
  window.dispatchEvent(new Event(preferenceEvent));
}

// A breadcrumb written by the book detail page. It records only that a book was
// opened in this browser; no workspace content is stored here.
const visitedBookKey = "kira-os:visited-book:v1";

function readVisitedBook() {
  try {
    return window.localStorage.getItem(visitedBookKey) === "true";
  } catch {
    return false;
  }
}

function subscribeVisitedBook(notify: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === visitedBookKey || event.key === null) notify();
  };
  window.addEventListener("storage", storageChanged);
  return () => window.removeEventListener("storage", storageChanged);
}

function subscribePreference(notify: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === preferenceKey || event.key === null) {
      sessionPreference = undefined;
      notify();
    }
  };
  window.addEventListener("storage", storageChanged);
  window.addEventListener(preferenceEvent, notify);
  return () => {
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(preferenceEvent, notify);
  };
}

/** Restore the optional home guide without changing any workspace content. */
export function reopenGettingStarted() {
  changePreference(false);
}

export function GettingStarted() {
  const { mode, approvals, ready, canEdit } = useWorkspace();
  const library = useLibrary();
  const [goal, setGoal] = useState<"book" | "marketing" | "ads">("book");
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const dismissed = useSyncExternalStore(subscribePreference, readPreference, () => false);
  const visitedBook = useSyncExternalStore(subscribeVisitedBook, readVisitedBook, () => false);
  if (mode !== "connected") return null;

  function hideSteps() {
    changePreference(true);
    requestAnimationFrame(() => reopenRef.current?.focus());
  }

  function showSteps() {
    reopenGettingStarted();
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  const ideas = approvals.filter((item) => item.data_origin === "manual" && item.recommendation_id === null).length;
  const decisions = approvals.filter((item) => item.data_origin !== "demo" && item.status !== "pending").length;
  const sharedSteps = [
    {
      title: "Explore your books",
      description: "Open a title and find its details and sources.",
      href: "/universe",
      link: "Open your books",
      complete: visitedBook,
      status: visitedBook ? "You’ve opened a book" : "A good place to begin",
    },
    {
      title: canEdit ? "Add to your shared desk" : "Explore the shared desk",
      description: canEdit ? "Give a business idea a title and a few lines at your desk." : "Read saved business briefs and the evidence behind them.",
      href: "/desk",
      link: !canEdit ? "Read the briefs" : ideas ? "Open your ideas" : "Add an idea",
      complete: ready && ideas > 0,
      status: ready && ideas > 0 ? `${ideas} shared ${ideas === 1 ? "brief is" : "briefs are"} already here` : "Ready when you are",
    },
    {
      title: canEdit ? "Review a shared idea" : "Try the agent workshop",
      description: canEdit ? "Read a brief, adjust it if needed, then approve or reject it." : "Build and download your own assistant blueprint. Saving workspace changes needs editor access.",
      href: canEdit ? "/desk" : "/learn",
      link: !canEdit ? "Learn & Create" : decisions ? "Open your decisions" : "Visit your desk",
      complete: canEdit && ready && decisions > 0,
      status: !canEdit ? "Your own thinking space" : ready && decisions > 0 ? `${decisions} shared ${decisions === 1 ? "decision" : "decisions"} recorded` : "Your judgment leads the way",
    },
  ];

  const knownBook = library.data?.books.find(book => book.active_manuscript_id);
  const bookHref = knownBook ? `/universe/${knownBook.slug}?knowledge=${goal === "marketing" ? "readers" : "characters"}#book-knowledge` : "/universe";
  const firstStep = goal === "ads" ? {
    title: "Understand your ads", description: "Review a saved report or bring an Ads Manager export. Choose a next experiment after checking the numbers.", href: "/ads", link: "Open Ads & Next Steps", complete: false, status: "Your ads and budgets stay under your control",
  } : goal === "marketing" ? {
    title: "Find a grounded marketing angle", description: knownBook ? `Explore the reader signals from ${knownBook.title}, then choose an angle to review with Raven.` : "Open a book and add source knowledge before exploring reader signals and marketing angles.", href: bookHref, link: knownBook ? "Explore this book’s marketing" : "Choose a book", complete: false, status: "Manuscript signals are ideas to test, not proof of demand",
  } : {
    ...sharedSteps[0], description: knownBook ? `Explore what Raven learned about ${knownBook.title}, with the passages behind each observation.` : sharedSteps[0].description, href: bookHref, link: knownBook ? "Explore book knowledge" : sharedSteps[0].link,
  };
  const steps = [firstStep, ...(goal === "marketing" ? [{ title: "Give the idea a plan", description: "Choose your books, set a business goal and review proposed next steps.", href: "/plans", link: "Open Marketing Plans", complete: false, status: canEdit ? "Review and save when you are ready" : "Read plans shared with this workspace" }, sharedSteps[1]] : goal === "ads" ? [{ title: "Return to a saved report", description: "Saved reports keep the export dates and source visible so you can compare the same time windows.", href: "/ads", link: "Review your reports", complete: false, status: canEdit ? "Import or refresh only when you choose" : "An owner or editor can add reports" }, sharedSteps[1]] : sharedSteps.slice(1))];

  if (dismissed) {
    return (
      <div className="learning-reopen">
        <Button ref={reopenRef} type="button" variant="ghost" size="sm" onClick={showSteps}>
          <Compass size={15} aria-hidden="true" /> Show my first steps
        </Button>
      </div>
    );
  }

  return (
    <section className="learning-start" aria-labelledby={headingId}>
      <div className="learning-start-heading">
        <div>
          <span className="learning-kicker"><Compass size={15} aria-hidden="true" /> MAKE YOURSELF AT HOME</span>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>Start with one small thing.</h2>
          <p>Choose what would help today. Brief and decision counts include work saved by everyone in this workspace; they are not a personal completion score.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={hideSteps}>
          <X size={14} aria-hidden="true" /><span>Hide for now</span>
        </Button>
      </div>
      <div className="learning-goals" role="group" aria-label="What would help today?">
        {([["book", "Understand a book"], ["marketing", "Plan book marketing"], ["ads", "Review Facebook ads"]] as const).map(([value, label]) => <Button key={value} type="button" variant={goal === value ? "default" : "outline"} aria-pressed={goal === value} onClick={() => setGoal(value)}>{label}</Button>)}
      </div>
      <ol className="learning-steps">
        {steps.map((step, index) => (
          <li className={`learning-step${step.complete ? " learning-step-complete" : ""}`} key={step.title}>
            <span className="learning-step-number" aria-hidden="true">{step.complete ? <Check size={16} /> : `0${index + 1}`}</span>
            <div className="learning-step-content">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <span className="learning-step-status">{step.complete && <span className="sr-only">Complete: </span>}{step.status}</span>
              <Link href={step.href} className="learning-step-link">{step.link}<ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
          </li>
        ))}
      </ol>
      <p className="learning-start-note"><BookOpen size={14} aria-hidden="true" /> You can always find your way with Guide at the top of your workspace.</p>
    </section>
  );
}
