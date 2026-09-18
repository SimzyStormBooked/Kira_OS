"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  CheckCheck,
  ChevronRight,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/db/demo-store";
import { instagramSnapshot, metrics } from "@/lib/data/seed";
import { KiraMetricCard } from "./metric-card";
import { RavenBriefing } from "./raven-briefing";
import { RecommendationCard } from "./recommendation-card";
import { AgentStatus } from "./agent-status";
import { DemoBadge } from "./origin-badge";
import { ConnectedHome } from "./connected-home";
export function MissionControl() {
  const state = useWorkspace();
  const pending = state.approvals.filter((a) => a.status === "pending");
  const recommendations = state.recommendations.filter(
    (r) => !state.dismissed.includes(r.id),
  );
  if (state.mode === "connected") return <ConnectedHome />;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow page-kicker">
            KIRA // AUTHOR INTELLIGENCE <span className="little-star">✦</span>
          </div>
          <h1>
            Good afternoon, <em>Cassandra.</em>
          </h1>
          <p>Here’s what your universe is doing.</p>
        </div>
        <div className="heading-note">
          <span className="eyebrow">YOUR PRIVATE COMMAND CENTER</span>
          <span>
            <ShieldCheck size={14} />
            Human judgment. Machine advantage.
          </span>
        </div>
      </div>
      <div className="metrics-heading">
        <span className="eyebrow">THE BIG PICTURE</span>
        <span>
          Illustrative 30-day snapshot <DemoBadge />
        </span>
      </div>
      <section className="metrics-grid" aria-label="Demo metrics">
        {metrics.map((m) => (
          <KiraMetricCard key={m.label} metric={m} />
        ))}
      </section>
      <div className="briefing-grid">
        <RavenBriefing />
        <Card className="desk-preview">
          <div className="desk-preview-heading">
            <span className="desk-icon">
              <FileCheck2 size={19} />
            </span>
            <span className="eyebrow">THE HUMAN TOUCH</span>
            <DemoBadge />
          </div>
          <h2>
            A few things
            <br />
            need <em>your instinct.</em>
          </h2>
          <p>
            {pending.length} {pending.length === 1 ? "decision" : "decisions"}{" "}
            waiting at Cassandra’s Desk.
          </p>
          <div className="desk-preview-list">
            {pending.slice(0, 3).map((a) => (
              <Link href="/desk" key={a.id}>
                <span className="desk-list-dot" />
                <span>
                  {a.title}
                  <small>{a.type} review</small>
                </span>
                <ChevronRight size={15} />
              </Link>
            ))}
            {pending.length === 0 && (
              <div className="empty-inline">
                <CheckCheck size={23} />
                The minions are working. Go write. 🖤
              </div>
            )}
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/desk">
              Take your seat <ArrowRight size={15} />
            </Link>
          </Button>
          <span className="desk-quiet">
            <ShieldCheck size={11} />
            Nothing leaves without you.
          </span>
        </Card>
      </div>
      <section className="moves-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SMALL MOVES. LONG GAME.</span>
            <h2>
              Today’s moves{" "}
              <span className="section-count">
                {recommendations.length.toString().padStart(2, "0")}
              </span>
            </h2>
          </div>
          <Link href="/raven" className="text-link">
            All intelligence <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="moves-grid">
          {recommendations.map((r, i) => (
            <RecommendationCard key={r.id} recommendation={r} index={i} />
          ))}
          {recommendations.length === 0 && (
            <p className="quiet-note">
              All recommendations set aside. Restore them from The Raven.
            </p>
          )}
        </div>
      </section>
      <div className="bottom-grid">
        <AgentStatus />
        <Card className="community-card">
          <div className="section-heading">
            <span className="eyebrow">A COMMUNITY, NOT A NUMBER</span>
            <Camera size={17} />
          </div>
          <h2>The coven is here.</h2>
          <div className="community-stats">
            <div>
              <strong>
                {instagramSnapshot.followers.toLocaleString("en-US")}
              </strong>
              <span>Instagram followers</span>
            </div>
            <div>
              <strong>{instagramSnapshot.posts}</strong>
              <span>Published posts</span>
            </div>
          </div>
          <div className="community-footer">
            <DemoBadge origin="manual" />
            <span>Snapshot date unknown · Not live</span>
          </div>
          <a
            href="https://www.instagram.com/kirastanleyauthor/"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            @kirastanleyauthor <ArrowUpRight size={14} />
          </a>
        </Card>
      </div>
    </>
  );
}
