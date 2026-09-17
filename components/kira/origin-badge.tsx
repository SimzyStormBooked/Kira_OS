import type { DataOrigin } from "@/types/domain";
import { originLabel } from "@/lib/knowledge/provenance";
import { cn } from "@/lib/utils";
export function DemoBadge({
  origin = "demo",
  className,
}: {
  origin?: DataOrigin;
  className?: string;
}) {
  return (
    <span className={cn("origin-badge", `origin-${origin}`, className)}>
      {originLabel(origin)}
    </span>
  );
}
