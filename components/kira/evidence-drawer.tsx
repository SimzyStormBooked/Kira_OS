"use client";
import { ArrowUpRight, FileSearch } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "./origin-badge";
import { evidenceUrl } from "@/lib/knowledge/provenance";
import type { Evidence } from "@/types/domain";
import "./desk.css";
/** Provenance in plain words. The raw identifier stays available under Technical details. */
const sourceTypeLabels: Record<Evidence["source_type"], string> = {
  synthetic: "Invented example",
  website: "Author website",
  manual_snapshot: "Manual snapshot",
  human_feedback: "Your own words",
  document: "Document you provided",
  api: "Connected service",
};
export function EvidenceDrawer({
  evidence,
  label = "Show me why",
  title = "Behind the recommendation",
}: {
  evidence: Evidence[];
  label?: string;
  title?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSearch size={14} />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent className="evidence-sheet">
        <SheetHeader>
          <span className="eyebrow">Provenance / Open file</span>
          <SheetTitle className="serif text-3xl">{title}</SheetTitle>
          <SheetDescription>
            Every conclusion should leave a paper trail. Here’s exactly what
            Raven used.
          </SheetDescription>
        </SheetHeader>
        <div className="sheet-body">
          {evidence.map((e) => (
            <article className="evidence-item" key={e.id}>
              <DemoBadge origin={e.data_origin} />
              <h3>{e.source}</h3>
              <p>{e.excerpt_or_metric}</p>
              <dl className="detail-list">
                <div>
                  <dt>Where this came from</dt>
                  <dd>{sourceTypeLabels[e.source_type]}</dd>
                </div>
                <div>
                  <dt>Recorded</dt>
                  <dd>{e.retrieved_at.slice(0, 10)}</dd>
                </div>
              </dl>
              <details className="evidence-technical">
                <summary>Technical details</summary>
                <dl className="detail-list">
                  <div>
                    <dt>Source ID</dt>
                    <dd className="mono break-all">{e.source_id}</dd>
                  </div>
                  <div>
                    <dt>Source type as stored</dt>
                    <dd className="mono break-all">{e.source_type}</dd>
                  </div>
                </dl>
              </details>
              {evidenceUrl(e) && (
                <a
                  href={evidenceUrl(e)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  Open original source <ArrowUpRight size={14} />
                </a>
              )}
            </article>
          ))}
          <div className="quiet-note">
            Confidence is a review aid, not a prediction of revenue or sales.
            Demo evidence cannot establish facts about your readers or books.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
