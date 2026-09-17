import { NextResponse } from "next/server";
import { findings, seedId } from "@/lib/data/seed";
import { demoProvider } from "@/lib/agents/demo-provider";
import { runProvider } from "@/lib/ai/provider";
import type { AgentRun } from "@/types/domain";
export async function POST() {
  // No user prompts, paid model calls, external writes, or untrusted URLs in Phase One.
  const started_at = new Date().toISOString();
  try {
    const recommendations = await runProvider(demoProvider, {
      capability: "ALLOW_MARKETING_ANALYSIS",
      findings,
      at: started_at,
    });
    const run: AgentRun = {
      id: crypto.randomUUID(),
      agent_id: seedId(30),
      started_at,
      completed_at: new Date().toISOString(),
      status: "completed",
      provider: "demo",
      model: "deterministic-v1",
      input_finding_ids: findings.map((f) => f.id),
      error: null,
      data_origin: "demo",
    };
    return NextResponse.json(
      { run, recommendations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Raven could not prepare the demo briefing. Please try again." },
      { status: 500 },
    );
  }
}
