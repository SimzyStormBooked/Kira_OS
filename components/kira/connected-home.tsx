"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  FileCheck2,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLibrary } from "./library-provider";
import { GettingStarted } from "./getting-started";
import { InspirationShelf } from "./inspiration-shelf";
import { DailyQuote } from "./daily-quote";
import { useWorkspace } from "@/lib/db/demo-store";

export function ConnectedHome({ dateKey }: { dateKey?: string }) {
  const library = useLibrary();
  const books = library.data?.books ?? [];
  const series = library.data?.series ?? [];
  const { approvals, feedback, ready, viewerEmail, canEdit } = useWorkspace();
  const pending = approvals.filter((approval) => approval.status === "pending");
  const reviewed = approvals.length - pending.length;
  const counts = [
    {
      label: "Your books",
      value: books.length,
      detail: "Your private book library",
      known: !!library.data,
    },
    {
      label: "Awaiting your eye",
      value: pending.length,
      detail: "Private briefs to review",
      known: ready,
    },
    {
      label: "Decisions kept",
      value: reviewed,
      detail: "Your reviewed history",
      known: ready,
    },
    {
      label: "Lessons saved",
      value: feedback.length,
      detail: "Your judgment, remembered",
      known: ready,
    },
  ];

  return (
    <div className="connected-home">
      <div className="page-heading">
        <div>
          <span className="eyebrow page-kicker">
            KIRA // YOUR AUTHOR WORKSPACE <span className="little-star">✦</span>
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
                A little of <em>your instinct.</em>
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
                    <Link href="/desk">
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
                  Your desk is clear. Make a little space for what’s next.
                </span>
              </div>
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
            <strong>
              {count.known ? String(count.value).padStart(2, "0") : "—"}
            </strong>
            <small>{count.detail}</small>
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
              explore what Kira learned, and check the sources behind it.
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
