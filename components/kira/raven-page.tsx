"use client";
import { useState } from "react";
import { z } from "zod";
import { Feather, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { recommendationSchema } from "@/types/domain";
import {
  useWorkspace,
  restoreRecommendations,
  saveRavenRun,
  showError,
} from "@/lib/db/demo-store";
import { tactics } from "@/lib/data/seed";
import { RavenBriefing } from "./raven-briefing";
import { RecommendationCard } from "./recommendation-card";
import { DemoBadge } from "./origin-badge";
import { AgentStatus } from "./agent-status";
export function RavenPage() {
  const state = useWorkspace();
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    try {
      const response = await fetch("/api/raven", { method: "POST" });
      if (!response.ok)
        throw new Error("Raven could not refresh. Please try again.");
      const result = z
        .object({
          recommendations: z.array(recommendationSchema),
          run: z.object({ completed_at: z.iso.datetime() }),
        })
        .parse(await response.json());
      saveRavenRun(result.recommendations, result.run.completed_at);
    } catch (e) {
      showError(e);
    } finally {
      setRunning(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow page-kicker">
            EXECUTIVE INTELLIGENCE / THE RAVEN
          </div>
          <h1>
            The long game.
            <br />
            <em>Your next move.</em>
          </h1>
          <p>
            Evidence first. Instinct always. A business team with a paper trail.
          </p>
        </div>
        <Button onClick={run} disabled={running || !state.ready}>
          <RefreshCw size={15} className={running ? "animate-spin" : ""} />
          {running ? "Synthesizing…" : "Refresh demo briefing"}
        </Button>
      </div>
      <div className="inline-notice">
        <Feather size={16} />
        <span>
          Deterministic demo engine · 3 seeded findings · No model or live
          connector running
          {state.last_run_at
            ? ` · Last run ${new Date(state.last_run_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            : ""}
        </span>
        <DemoBadge />
      </div>
      <RavenBriefing />
      <section className="moves-section">
        <div className="section-heading">
          <h2>Recommended moves</h2>
          {state.dismissed.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                try {
                  restoreRecommendations();
                } catch (e) {
                  showError(e);
                }
              }}
            >
              <RotateCcw size={14} />
              Restore set-aside moves ({state.dismissed.length})
            </Button>
          )}
        </div>
        <div className="moves-grid">
          {state.recommendations
            .filter((r) => !state.dismissed.includes(r.id))
            .map((r, i) => (
              <RecommendationCard key={r.id} recommendation={r} index={i} />
            ))}
        </div>
      </section>
      <div className="bottom-grid">
        <AgentStatus />
        <Card className="tactic-card">
          <div className="section-heading">
            <span className="eyebrow">TACTIC MEMORY</span>
            <DemoBadge />
          </div>
          <h2>
            Good advice has
            <br />
            an expiration date.
          </h2>
          {tactics.map((t) => (
            <div key={t.id}>
              <h3>{t.tactic}</h3>
              <span className="status-pill">{t.status}</span>
              <p>{t.context}</p>
              <small>Trend: unknown · No comparable measurements</small>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
