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
          <span className="eyebrow">PROVENANCE / OPEN FILE</span>
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
                  <dt>Source type</dt>
                  <dd>{e.source_type.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt>Recorded</dt>
                  <dd>{e.retrieved_at.slice(0, 10)}</dd>
                </div>
                <div>
                  <dt>Source ID</dt>
                  <dd className="mono break-all text-[10px]">{e.source_id}</dd>
                </div>
              </dl>
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
            Demo evidence cannot establish facts about Kira’s readers or books.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
