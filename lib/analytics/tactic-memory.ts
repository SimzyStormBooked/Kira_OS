import type { TacticMemory } from "@/types/domain";
/** No inferred trend without comparable measurements. Threshold analytics are intentionally deferred. */
export function hasComparablePerformance(tactic: TacticMemory): boolean {
  return Object.keys(tactic.historical_performance).some(
    (key) =>
      Number.isFinite(tactic.historical_performance[key]) &&
      Number.isFinite(tactic.recent_performance[key]),
  );
}
