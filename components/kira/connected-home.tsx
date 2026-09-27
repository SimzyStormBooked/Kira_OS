"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  FileCheck2,
  LockKeyhole,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLibrary } from "./library-provider";
import { GettingStarted } from "./getting-started";
import { InspirationShelf } from "./inspiration-shelf";
import { DailyQuote } from "./daily-quote";
import { useWorkspace } from "@/lib/db/demo-store";
import { inspirationIdeas } from "@/lib/data/inspiration";
import { resumeReadingLabel, workspaceResumeSchema, type WorkspaceResume } from "@/lib/workspace-resume";
import "./daily-workspace.css";

const starterIdeas = inspirationIdeas.slice(0, 2);
const savedDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function ContinueWork() {
  const { request } = useLibrary();
  const [data, setData] = useState<WorkspaceResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    async function load() {
      controller?.abort();
      const next = new AbortController(); controller = next;
      setLoading(true);
      try {
        const summary = workspaceResumeSchema.parse(await request("/api/workspace/resume", { signal: next.signal }));
        if (active && !next.signal.aborted) { setData(summary); setError(false); }
      } catch {
        if (active && !next.signal.aborted) setError(true);
      } finally { if (active && !next.signal.aborted) setLoading(false); }
    }
    void Promise.resolve().then(() => { if (active) void load(); });
    const onFocus = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; controller?.abort(); window.removeEventListener("focus", onFocus); };
  }, [request, refresh]);
  return <section className="connected-resume" aria-labelledby="continue-work-title" aria-busy={loading}>
    <div className="connected-resume-heading"><div><span className="eyebrow">PICK UP A THREAD</span><h2 id="continue-work-title">Continue your work</h2><p>Latest saved answer and recently updated books, shared by this workspace.</p></div><Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />Refresh</Button></div>
    {error && <p role="status" className="quiet-note">Saved activity could not be refreshed. {data ? "The last loaded items remain below." : "Use your books or Ask Raven to continue, or try Refresh."}</p>}
    {!data && loading && <p role="status" className="quiet-note">Opening your saved work…</p>}
    {data && <div className="connected-resume-items">
      {data.answer && <Link href={`/studio/${data.answer.id}`} className="connected-resume-item"><MessageSquare size={19} aria-hidden="true" /><span><small>SAVED RAVEN ANSWER</small><strong>{data.answer.title || "Open your saved answer"}</strong><span>Saved {savedDate(data.answer.completed_at ?? data.answer.created_at)}</span><em>Revisit this answer</em></span><ArrowUpRight size={16} aria-hidden="true" /></Link>}
      {data.books.map(book => <Link key={book.id} href={`/universe/${book.slug}${book.reading?.status === "ready" ? "?knowledge=characters#book-knowledge" : book.reading ? "#reading-status" : ""}`} className="connected-resume-item"><BookOpen size={19} aria-hidden="true" /><span><small>{resumeReadingLabel(book.reading)}</small><strong>{book.title}</strong><span>Book updated {savedDate(book.updated_at)}{book.reading && ` · ${book.reading.completed_chunks} of ${book.reading.chunk_count} passages read`}</span><em>{book.reading?.status === "ready" ? "Explore what Raven learned" : book.reading ? "Open reading status" : "Open book details"}</em></span><ArrowUpRight size={16} aria-hidden="true" /></Link>)}
      {!data.answer && data.books.length === 0 && <p className="quiet-note">Saved answers and books will appear here as your workspace grows. <Link href="/universe" className="text-link">Start with your books</Link>.</p>}
    </div>}
  </section>;
}

export function ConnectedHome({ dateKey }: { dateKey?: string }) {
  const library = useLibrary();
  const books = library.data?.books ?? [];
  const series = library.data?.series ?? [];
  const { approvals, feedback, ready, viewerEmail, canEdit, sessionEnded } = useWorkspace();
  const pending = approvals.filter((approval) => approval.status === "pending");
  const reviewed = approvals.length - pending.length;
  const counts = [
    {
      label: "Your books",
      value: books.length,
      detail: "Your private book library",
      empty: "No books in this workspace yet",
      known: !!library.data,
    },
    {
      label: "Awaiting your eye",
      value: pending.length,
      detail: "Private briefs to review",
      empty: "Nothing waiting yet",
      known: ready,
    },
    {
      label: "Decisions kept",
      value: reviewed,
      detail: "Your reviewed history",
      empty: "No decisions recorded yet",
      known: ready,
    },
    {
      label: "Lessons saved",
      value: feedback.length,
      detail: "Your judgment, remembered",
      empty: "No lessons saved yet",
      known: ready,
    },
  ];

  return (
    <div className="connected-home">
      <div className="page-heading">
        <div>
          <span className="eyebrow page-kicker">
            KIRA // YOUR AUTHOR WORKSPACE{" "}
            <span className="little-star" aria-hidden="true">
              ✦
            </span>
          </span>
          <h1>
            Welcome home, <em>Cassandra.</em>
          </h1>
          <p>A place for the business. More room for your stories.</p>
        </div>
        <span className="connected-private">
          <LockKeyhole size={13} aria-hidden="true" /> Private workspace
        </span>
      </div>

      {ready && !sessionEnded && <ContinueWork key={viewerEmail ?? "workspace"} />}
      <DailyQuote dateKey={dateKey} compact />
      <div className="connected-main-grid">
        <InspirationShelf dateKey={dateKey} />

        <Card className="connected-desk">
          <div className="connected-card-heading">
            <span className="eyebrow">CASSANDRA’S DESK</span>
            <FileCheck2 size={20} strokeWidth={1.3} aria-hidden="true" />
          </div>
          <h2>
            {pending.length ? (
              <>
                Waiting on <em>your call.</em>
              </>
            ) : (
              <>
                Start with <em>one good idea.</em>
              </>
            )}
          </h2>
          {!ready ? (
            <p role="status">Opening your saved workspace…</p>
          ) : pending.length ? (
            <>
              <p>
                {pending.length}{" "}
                {pending.length === 1 ? "brief is" : "briefs are"} waiting for
                your eye.
              </p>
              <ul className="connected-pending-list">
                {pending.slice(0, 3).map((approval) => (
                  <li key={approval.id}>
                    <Link href={`/desk?brief=${encodeURIComponent(approval.id)}`}>
                      <span>{approval.title}</span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>
                A launch thought. A promotion. Something you want to come back
                to with fresh eyes.
              </p>
              <div className="connected-clear">
                <CheckCheck size={19} aria-hidden="true" />
                <span>
                  Your desk is clear. Add an idea when one turns up.
                </span>
              </div>
              {canEdit && (
                <>
                  <p className="connected-starter-label">
                    Or start from one of these:
                  </p>
                  <ul className="connected-pending-list connected-starter-list">
                    {starterIdeas.map((idea) => (
                      <li key={idea.id}>
                        <Link href={`/desk?idea=${encodeURIComponent(idea.id)}`}>
                          <span>{idea.title}</span>
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          <Button asChild variant="outline">
            <Link href="/desk">
              {!canEdit ? "Read workspace briefs" : pending.length ? "Review shared briefs" : "Add an idea or request"}
              <ArrowRight size={15} />
            </Link>
          </Button>
        </Card>
      </div>

      <GettingStarted />
      <section
        className="connected-overview"
        aria-label="Your workspace at a glance"
        aria-busy={!ready}
      >
        {counts.map((count) => (
          <div className="connected-stat" key={count.label}>
            <span>{count.label}</span>
            <strong aria-hidden={count.known && count.value > 0 ? undefined : true}>
              {count.known && count.value > 0 ? count.value : "—"}
            </strong>
            <small>
              {count.known && count.value === 0 ? count.empty : count.detail}
            </small>
          </div>
        ))}
      </section>

      <div className="connected-foundation-grid">
        <Card className="connected-catalog">
          <BookOpen size={25} strokeWidth={1.2} aria-hidden="true" />
          <div>
            <span className="eyebrow">THE UNIVERSE</span>
            <h2>
              {books.length} titles. <em>A growing memory.</em>
            </h2>
            <p>
              {series.length} series and collections. Open a book to add a manuscript,
              explore what Raven learned, and check the sources behind it.
            </p>
          </div>
          <Link
            href="/universe"
            className="connected-round-link"
            aria-label="Open the book catalog"
          >
            <ArrowUpRight size={20} />
          </Link>
        </Card>
        <Card className="connected-next">
          <span className="eyebrow">THE NEXT CHAPTER</span>
          <h2>
            Follow <em>your curiosity.</em>
          </h2>
          <p>
            Shape an agent idea, learn a useful trick, or gather your social
            accounts in one place. Start wherever the energy is.
          </p>
          <div className="connected-explore-links">
            <Link href="/learn" className="text-link">Learn & Create <ArrowUpRight size={14} /></Link>
            <Link href="/studio" className="text-link">Ask Raven <ArrowUpRight size={14} /></Link>
            <Link href="/connections" className="text-link">Your connections <ArrowUpRight size={14} /></Link>
          </div>
        </Card>
      </div>
      {viewerEmail && (
        <p className="connected-account">
          <LockKeyhole size={12} aria-hidden="true" />
          <span>Signed in as {viewerEmail}</span>
        </p>
      )}
    </div>
  );
}
