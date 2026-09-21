import { ArrowDownRight, ArrowUpRight, MoveRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "./origin-badge";
import type { metrics } from "@/lib/data/seed";
/**
 * The direction comes from the record, never from "does this metric have a chart".
 * A signed change wins; otherwise the shape of the series decides; anything we cannot
 * read stays neutral, so a flat or falling number can never render as a rise.
 */
function readDirection(metric: (typeof metrics)[number]): -1 | 0 | 1 {
  const change = metric.change.trim();
  if (change.startsWith("+")) return 1;
  if (change.startsWith("-") || change.startsWith("−")) return -1;
  const [first] = metric.values;
  const last = metric.values[metric.values.length - 1];
  if (metric.values.length > 1 && first !== undefined && last !== undefined)
    return last > first ? 1 : last < first ? -1 : 0;
  return 0;
}
export function KiraMetricCard({
  metric,
}: {
  metric: (typeof metrics)[number];
}) {
  const points = metric.values
    .map((v, i) => `${i * 12},${40 - v * 2}`)
    .join(" ");
  const direction = readDirection(metric);
  return (
    <Card className="metric-card" data-origin={metric.data_origin}>
      <div className="metric-top">
        <span>{metric.label}</span>
        <DemoBadge />
      </div>
      <div className="metric-value">{metric.value}</div>
      <div className="metric-bottom">
        <span
          className={
            direction === 0
              ? "metric-neutral"
              : direction > 0
                ? "metric-change metric-up"
                : "metric-change metric-down"
          }
        >
          {direction === 0 ? (
            <MoveRight size={12} aria-hidden="true" />
          ) : direction > 0 ? (
            <ArrowUpRight size={12} aria-hidden="true" />
          ) : (
            <ArrowDownRight size={12} aria-hidden="true" />
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
