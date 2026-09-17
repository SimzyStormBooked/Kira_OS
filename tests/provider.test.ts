import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runProvider, type IntelligenceProvider } from "@/lib/ai/provider";
import { demoProvider } from "@/lib/agents/demo-provider";
import { findings, seedTime } from "@/lib/data/seed";
import { prioritizeFindings } from "@/lib/agents/raven";

describe("Server provider boundary", () => {
  const input = {
    capability: "ALLOW_MARKETING_ANALYSIS" as const,
    findings,
    at: seedTime,
  };
  it("accepts valid, provenance-preserving demo output", async () => {
    expect(await runProvider(demoProvider, input)).toHaveLength(3);
  });
  it("blocks forbidden work before invoking a provider", async () => {
    const synthesize = vi.fn();
    const provider: IntelligenceProvider = {
      config: demoProvider.config,
      synthesize,
    };
    await expect(
      runProvider(provider, {
        ...input,
        capability: "ALLOW_FICTION_GENERATION",
      }),
    ).rejects.toThrow(/firewall/);
    expect(synthesize).not.toHaveBeenCalled();
  });
  it("rejects fabricated excerpts even with an existing source ID", async () => {
    const results = prioritizeFindings(findings, seedTime);
    results[0] = {
      ...results[0],
      evidence: [
        {
          ...results[0].evidence[0],
          excerpt_or_metric: "Fabricated live claim",
        },
      ],
    };
    const provider: IntelligenceProvider = {
      config: demoProvider.config,
      async synthesize() {
        return results;
      },
    };
    await expect(runProvider(provider, input)).rejects.toThrow(/preserve/);
  });
  it("rejects laundering demo conclusions into verified ones", async () => {
    const results = prioritizeFindings(findings, seedTime);
    results[0] = { ...results[0], data_origin: "public_verified" };
    const provider: IntelligenceProvider = {
      config: demoProvider.config,
      async synthesize() {
        return results;
      },
    };
    await expect(runProvider(provider, input)).rejects.toThrow(/relabel/);
  });
});
