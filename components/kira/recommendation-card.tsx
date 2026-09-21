"use client";
import { ArrowUpRight, Clock3, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EvidenceDrawer } from "./evidence-drawer";
import { DemoBadge } from "./origin-badge";
import { useWorkspace } from "@/lib/db/demo-store";
import type { AgentRecommendation } from "@/types/domain";
export function RecommendationCard({
  recommendation: rec,
  index,
}: {
  recommendation: AgentRecommendation;
  index: number;
}) {
  const { approvals, ready } = useWorkspace();
  const { queueRecommendation, showError } = useWorkspace();
  const queued = approvals.some((a) => a.recommendation_id === rec.id);
  return (
    <Card className="recommendation-card">
      <div className="recommendation-top">
        <span className="move-number" aria-hidden="true">
          0{index + 1}
        </span>
        <span className="eyebrow">{rec.objective}</span>
        <DemoBadge origin={rec.data_origin} />
      </div>
      <h3>{rec.title}</h3>
      <p>{rec.description}</p>
      <div className="recommendation-meta">
        <span>
          <span className="confidence-dot" />
          {Math.round(rec.confidence * 100)}% confidence
        </span>
        <span>
          <Clock3 size={12} />
          {rec.effort} effort
        </span>
      </div>
      <details className="reason-details">
        <summary>Why this move</summary>
        <p>{rec.reason}</p>
        <small>
          {rec.source} · {rec.created_at.slice(0, 10)}
        </small>
      </details>
      <div className="recommendation-actions">
        <EvidenceDrawer evidence={rec.evidence} label="Evidence" />
        <Button
          variant="ghost"
          size="sm"
          disabled={!ready || queued}
          onClick={() => {
            try {
              queueRecommendation(rec);
            } catch (e) {
              showError(e);
            }
          }}
        >
          {queued ? (
            <>
              <FileCheck2 size={14} />
              At the desk
            </>
          ) : (
            <>
              Prepare brief
              <ArrowUpRight size={15} />
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
