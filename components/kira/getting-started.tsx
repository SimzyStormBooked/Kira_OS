"use client";

import { useId, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Check, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/db/demo-store";

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
  const steps = [
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
          <p>Explore at your own pace. Counts include starter briefs and work saved by everyone in this workspace.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={hideSteps}>
          <X size={14} aria-hidden="true" /><span>Hide for now</span>
        </Button>
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
