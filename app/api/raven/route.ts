import { getWorkspaceConfig } from "@/lib/config";
import {
  requireWorkspaceSession,
  WorkspaceAccessError,
} from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { NextResponse } from "next/server";
import { findings, seedId } from "@/lib/data/seed";
import { demoProvider } from "@/lib/agents/demo-provider";
import { runProvider } from "@/lib/ai/provider";
import type { AgentRun } from "@/types/domain";
export async function POST(request: Request) {
  if (getWorkspaceConfig().mode === "connected") {
    try {
      assertSameOrigin(request);
      await requireWorkspaceSession();
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof WorkspaceAccessError
              ? error.message
              : "Workspace unavailable.",
        },
        {
          status: error instanceof WorkspaceAccessError ? error.status : 503,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    return NextResponse.json(
      {
        error:
          "Live intelligence is not connected yet. You can save business briefs at Cassandra’s Desk.",
      },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }
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
