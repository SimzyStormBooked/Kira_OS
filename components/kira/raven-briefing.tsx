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
          <span className="briefing-edition">{state.mode === "demo" ? "DEMO BRIEFING" : "RECOMMENDATIONS / NOT MONITORING"}</span>
          {state.mode === "demo" && <DemoBadge />}
        </div>
        <p className="raven-intro">
          {state.mode === "demo"
            ? "Example findings, ranked for review. You make the call."
            : "Your evidence. Your judgment. A clear next step."}
        </p>
        <span className="eyebrow signal-label">
          {rec ? "A FINDING TO REVIEW" : state.mode === "demo" ? "DEMO MOVES SET ASIDE" : "NO CONNECTED FINDINGS YET"}
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
              {state.mode === "demo" ? "A little room" : "Start with"}
              <br />
              <em>{state.mode === "demo" ? "to breathe." : "what you know."}</em>
            </>
          )}
        </h2>
        <p className="raven-summary">
          {rec?.description ??
            (state.mode === "demo"
              ? "You’ve set the demo recommendations aside. Restore them from The Raven whenever you’re ready."
              : "Raven is not monitoring your accounts or researching in the background. Capture a business brief at Cassandra’s Desk to keep your own evidence, decisions, and guidance together.")}
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
          : "No background monitoring · No connected recommendation sources"}
      </div>
    </Card>
  );
}
