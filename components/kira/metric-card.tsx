import { ArrowUpRight, MoveRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "./origin-badge";
import type { metrics } from "@/lib/data/seed";
export function KiraMetricCard({
  metric,
}: {
  metric: (typeof metrics)[number];
}) {
  const points = metric.values
    .map((v, i) => `${i * 12},${40 - v * 2}`)
    .join(" ");
  return (
    <Card className="metric-card">
      <div className="metric-top">
        <span>{metric.label}</span>
        <DemoBadge />
      </div>
      <div className="metric-value">{metric.value}</div>
      <div className="metric-bottom">
        <span
          className={metric.values.length ? "metric-change" : "metric-neutral"}
        >
          {metric.values.length ? (
            <ArrowUpRight size={12} />
          ) : (
            <MoveRight size={12} />
          )}{" "}
          {metric.change}
        </span>
        {points && (
          <svg viewBox="0 0 84 42" className="sparkline" aria-hidden="true">
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        )}
      </div>
      <span className="sr-only">{metric.detail}. Demo data.</span>
    </Card>
  );
}
