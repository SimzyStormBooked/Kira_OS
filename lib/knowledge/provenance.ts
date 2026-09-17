import {
  findingSchema,
  type AgentFinding,
  type DataOrigin,
  type Evidence,
} from "@/types/domain";
export function originLabel(origin: DataOrigin): string {
  return {
    demo: "DEMO",
    manual: "MANUAL SNAPSHOT",
    public_verified: "PUBLIC SOURCE",
  }[origin];
}
export function derivedOrigin(origins: DataOrigin[]): DataOrigin {
  if (!origins.length) throw new Error("Provenance is required");
  return origins.includes("demo")
    ? "demo"
    : origins.includes("manual")
      ? "manual"
      : "public_verified";
}
export function validateFinding(input: unknown): AgentFinding {
  const finding = findingSchema.parse(input);
  for (const item of finding.evidence) {
    if (!finding.source_ids.includes(item.source_id))
      throw new Error("Evidence references an undeclared source");
    if (item.source_type === "synthetic" && item.data_origin !== "demo")
      throw new Error("Synthetic evidence must be labeled demo");
  }
  if (
    finding.evidence.some((e) => e.data_origin === "demo") &&
    finding.data_origin !== "demo"
  )
    throw new Error("Demo evidence cannot support a non-demo finding");
  return finding;
}
export function evidenceUrl(item: Evidence): string | undefined {
  const value = item.metadata.url;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
