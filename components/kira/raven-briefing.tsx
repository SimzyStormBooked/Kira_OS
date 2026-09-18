"use client";
import { ArrowUpRight, Feather } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "./origin-badge";
import { EvidenceDrawer } from "./evidence-drawer";
import { RavenArt } from "./raven-art";
import { useWorkspace } from "@/lib/db/demo-store";
export function RavenBriefing() {
  const state = useWorkspace();
  const { dismissRecommendation, queueRecommendation, showError } =
    useWorkspace();
  const rec = state.recommendations.find(
    (r) => !state.dismissed.includes(r.id),
  );
  const queued =
    rec && state.approvals.some((a) => a.recommendation_id === rec.id);
  return (
    <Card className="raven-briefing">
      <div className="raven-visual">
        <RavenArt />
      </div>
      <div className="raven-content">
        <div className="raven-heading">
          <span className="eyebrow">
            <Feather size={14} /> THE RAVEN
          </span>
          <span className="briefing-edition">DAILY BRIEFING / 001</span>
          {state.mode === "demo" && <DemoBadge />}
        </div>
        <p className="raven-intro">
          {state.mode === "demo"
            ? "I connected the dots. You make the call."
            : "Your evidence. Your judgment. A clear next step."}
        </p>
        <span className="eyebrow signal-label">
          {rec ? "TODAY’S SIGNAL" : "ALL CLEAR, CASSANDRA"}
        </span>
        <h2>
          {rec?.finding_id.endsWith("40") ? (
            <>
              Devotion has
              <br />
              <em>their attention.</em>
            </>
          ) : rec ? (
            rec.title
          ) : (
            <>
              A little room
              <br />
              <em>to breathe.</em>
            </>
          )}
        </h2>
        <p className="raven-summary">
          {rec?.description ??
            (state.mode === "demo"
              ? "You’ve set the demo recommendations aside. Restore them from The Raven whenever you’re ready."
              : "No live findings yet. Start by capturing a business brief at Cassandra’s Desk; your decisions and guidance will stay together.")}
        </p>
        {rec && (
          <p className="raven-reason">
            <strong>WHY IT MATTERS</strong> {rec.reason}
          </p>
        )}
        <div className="raven-actions">
          {rec ? (
            <>
              <EvidenceDrawer evidence={rec.evidence} />
              <Button
                onClick={() => {
                  try {
                    queueRecommendation(rec);
                  } catch (e) {
                    showError(e);
                  }
                }}
                disabled={!state.ready || queued}
              >
                {queued ? "At Cassandra’s Desk" : "Prepare campaign"}
                <ArrowUpRight size={14} />
              </Button>
              <Button
                variant="ghost"
                className="not-today"
                disabled={!state.ready}
                onClick={() => {
                  try {
                    dismissRecommendation(rec.id);
                  } catch (e) {
                    showError(e);
                  }
                }}
              >
                Not today
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link href={state.mode === "demo" ? "/raven" : "/desk"}>
                {state.mode === "demo"
                  ? "Visit The Raven"
                  : "Open Cassandra’s Desk"}{" "}
                <ArrowUpRight size={14} />
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="raven-footnote">
        <span className="tiny-diamond">✦</span>{" "}
        {state.mode === "demo"
          ? "Demo synthesis · Seeded findings · Your judgment, always."
          : "Private workspace · Live synthesis not connected"}
      </div>
    </Card>
  );
}
