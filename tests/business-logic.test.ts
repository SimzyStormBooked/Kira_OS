import { describe, expect, it } from "vitest";
import {
  findings,
  initialApprovals,
  evidence,
  seedId,
  seedTime,
  metrics,
  books,
  instagramSnapshot,
  tactics,
} from "@/lib/data/seed";
import { prioritizeFindings } from "@/lib/agents/raven";
import { createFeedback, transitionApproval } from "@/lib/agents/approvals";
import {
  derivedOrigin,
  evidenceUrl,
  originLabel,
  validateFinding,
} from "@/lib/knowledge/provenance";
import {
  assertCapability,
  assertExternalExecution,
  creativeFirewall,
  type Capability,
} from "@/lib/ai/policy";
import { freshWorkspace, parseWorkspace } from "@/lib/db/demo-store";
import { hasComparablePerformance } from "@/lib/analytics/tactic-memory";

describe("Raven recommendation prioritization", () => {
  it("prioritizes evidence-weighted review value deterministically", () => {
    const results = prioritizeFindings(findings, seedTime);
    expect(results.map((r) => r.finding_id)).toEqual([
      seedId(40),
      seedId(41),
      seedId(42),
    ]);
    expect(results[0].priority_score).toBe(74);
    expect(prioritizeFindings([...findings].reverse(), seedTime)).toEqual(
      results,
    );
  });
  it("penalizes older evidence rather than older presentation timestamps", () => {
    const old = {
      ...findings[0],
      evidence: [{ ...evidence[0], retrieved_at: "2026-01-01T00:00:00.000Z" }],
    };
    expect(prioritizeFindings([old, findings[1]], seedTime)[0].finding_id).toBe(
      findings[1].id,
    );
  });
  it("does not suggest reviewed or dismissed findings", () => {
    expect(
      prioritizeFindings([{ ...findings[0], status: "dismissed" }], seedTime),
    ).toEqual([]);
  });
  it("does not claim live intelligence or ROI", () => {
    for (const r of prioritizeFindings(findings, seedTime)) {
      expect(r.data_origin).toBe("demo");
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.source).toContain("deterministic");
      expect(r).not.toHaveProperty("roi");
    }
  });
  it("rejects invalid evaluation dates and confidence", () => {
    expect(() => prioritizeFindings(findings, "invalid")).toThrow();
    expect(() =>
      prioritizeFindings([{ ...findings[0], confidence: 1.1 }], seedTime),
    ).toThrow();
  });
});
describe("Provenance and demo labeling", () => {
  it("marks all invented metrics as demo, preserves the supplied snapshot", () => {
    expect(metrics.every((m) => m.data_origin === "demo")).toBe(true);
    expect(instagramSnapshot.data_origin).toBe("manual");
    expect(instagramSnapshot.followers).toBe(5447);
    expect(instagramSnapshot.captured_at).toBeNull();
  });
  it("keeps unverified book descriptions empty", () => {
    expect(books).toHaveLength(8);
    expect(
      books.every(
        (b) =>
          b.description === null &&
          b.verification_status === "partial" &&
          b.source_url.startsWith("https://www.kirastanleyauthor.com/"),
      ),
    ).toBe(true);
  });
  it("propagates demo origin through mixed-source conclusions", () => {
    expect(derivedOrigin(["public_verified", "demo"])).toBe("demo");
    expect(derivedOrigin(["manual", "public_verified"])).toBe("manual");
    expect(originLabel("demo")).toBe("DEMO");
    expect(() => derivedOrigin([])).toThrow();
  });
  it("rejects evidence-free findings", () => {
    expect(() => validateFinding({ ...findings[0], evidence: [] })).toThrow();
  });
  it("rejects undeclared sources", () => {
    expect(() =>
      validateFinding({ ...findings[0], source_ids: [seedId(999)] }),
    ).toThrow(/undeclared/);
  });
  it("prevents laundering synthetic evidence into verified findings", () => {
    expect(() =>
      validateFinding({ ...findings[0], data_origin: "public_verified" }),
    ).toThrow(/Demo/);
    expect(() =>
      validateFinding({
        ...findings[0],
        evidence: [{ ...evidence[0], data_origin: "manual" }],
      }),
    ).toThrow(/Synthetic/);
  });
  it("allows only HTTPS evidence links", () => {
    expect(
      evidenceUrl({ ...evidence[0], metadata: { url: "javascript:alert(1)" } }),
    ).toBeUndefined();
    expect(evidenceUrl(evidence[1])).toContain("https://");
  });
});
describe("Cassandra's approval lifecycle", () => {
  const request = initialApprovals[0];
  it("supports review without execution", () => {
    const approved = transitionApproval(
      request,
      { type: "approve" },
      seedTime,
      0,
    );
    expect(approved.status).toBe("approved");
    expect(approved.version).toBe(1);
    expect(() => assertExternalExecution()).toThrow();
  });
  it("keeps edited drafts pending", () => {
    const edited = transitionApproval(
      request,
      { type: "edit", draft: " Cassandra’s revision " },
      seedTime,
      0,
    );
    expect(edited.draft).toBe("Cassandra’s revision");
    expect(edited.status).toBe("pending");
  });
  it("rejects stale writes, blank edits and second decisions", () => {
    expect(() =>
      transitionApproval(request, { type: "approve" }, seedTime, 5),
    ).toThrow(/changed/);
    expect(() =>
      transitionApproval(request, { type: "edit", draft: "  " }, seedTime, 0),
    ).toThrow();
    const rejected = transitionApproval(
      request,
      { type: "reject" },
      seedTime,
      0,
    );
    expect(() =>
      transitionApproval(rejected, { type: "approve" }, seedTime, 1),
    ).toThrow(/pending/);
  });
  it("persists human nuance even after rejection", () => {
    const rejected = transitionApproval(
      request,
      { type: "reject" },
      seedTime,
      0,
    );
    const feedback = createFeedback(
      rejected,
      "Those readers aren’t my audience.",
      seedTime,
      seedId(200),
    );
    expect(feedback.approval_request_id).toBe(request.id);
    expect(feedback.data_origin).toBe("manual");
    expect(feedback.scope).toBe("demo_workspace");
  });
  it("rejects blank or excessive feedback", () => {
    expect(() =>
      createFeedback(request, "  ", seedTime, seedId(201)),
    ).toThrow();
    expect(() =>
      createFeedback(request, "x".repeat(4001), seedTime, seedId(201)),
    ).toThrow();
  });
});
describe("Creative firewall", () => {
  it.each([
    "ALLOW_MANUSCRIPT_GENERATION",
    "ALLOW_SCENE_GENERATION",
    "ALLOW_CHAPTER_GENERATION",
    "ALLOW_FICTION_GENERATION",
  ] as Capability[])("blocks %s", (capability) =>
    expect(() => assertCapability(capability)).toThrow(/firewall/),
  );
  it("allows business analysis and approved-source repurposing only", () => {
    expect(() => assertCapability("ALLOW_MARKETING_ANALYSIS")).not.toThrow();
    expect(() =>
      assertCapability("ALLOW_APPROVED_CONTENT_REPURPOSING"),
    ).toThrow(/approved/);
    expect(() =>
      assertCapability("ALLOW_APPROVED_CONTENT_REPURPOSING", {
        sourceApproved: true,
      }),
    ).not.toThrow();
    expect(Object.isFrozen(creativeFirewall)).toBe(true);
  });
});
describe("Workspace durability", () => {
  it("round-trips decisions, drafts and teaching through the versioned schema", () => {
    const workspace = freshWorkspace();
    workspace.approvals[0] = transitionApproval(
      workspace.approvals[0],
      { type: "edit", draft: "Keep the humor." },
      seedTime,
      0,
    );
    workspace.feedback.push(
      createFeedback(
        workspace.approvals[0],
        "Keep it funny.",
        seedTime,
        seedId(210),
      ),
    );
    expect(parseWorkspace(JSON.stringify(workspace))).toEqual(workspace);
  });
  it("rejects malformed or incompatible storage", () => {
    expect(() => parseWorkspace("not json")).toThrow();
    expect(() =>
      parseWorkspace(JSON.stringify({ ...freshWorkspace(), version: 20 })),
    ).toThrow();
  });
  it("does not infer performance from an empty tactic history", () => {
    expect(hasComparablePerformance(tactics[0])).toBe(false);
  });
});
