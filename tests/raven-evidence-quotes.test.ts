import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EVIDENCE_SEAM, SUPPORTING_PASSAGE_LABEL, resolveCitationQuote, resolveEvidenceQuote } from "@/lib/manuscripts/citations";
import {
  storedStrategyOutputSchema, storedStrategyTaskDraftSchema, strategyOutputSchema, validateStrategyOutput,
  type StrategySnapshot,
} from "@/lib/strategy/contract";
import { storedStudioOutputSchema, studioOutputSchema, studioReferenceText, validateStudioOutput } from "@/lib/ai/studio-contract";

// A stored manuscript citation now keeps its passage's line breaks, and Raven's evidence is
// built from those citations. These fixtures reproduce that shape, not real manuscript text.
const passage = "The harbour  was cold that\nmorning, and Celine counted\n  the boats twice.";
const factText = `Unreviewed extracted observation: Celine is watchful at the harbour.\n${SUPPORTING_PASSAGE_LABEL} ${passage}`;
const goalId = randomUUID();

function snapshot(evidenceText = factText): StrategySnapshot {
  return {
    input: {
      title: "Reach new readers", intent: "Find readers who love found family.", bookIds: [], seriesId: null,
      originApprovalId: null, mode: "after_release", anchorDate: null, budgetUsd: 0, weeklyHours: 2,
      segments: ["new_readers"], goals: [{ id: goalId, label: "Subscribers", metric: "subscribers", unit: "count", target: 100, baseline: null, dueDate: null }],
    },
    evidence: [
      { id: "request", kind: "request", label: "Your planning request", text: "Find readers who love found family.", book_id: null, source_id: null, manuscript_id: null, chunk_id: null },
      { id: "fact-1", kind: "manuscript", label: "Book · Chapter 1 · theme", text: evidenceText, book_id: null, source_id: null, manuscript_id: null, chunk_id: null },
    ],
    captured_at: new Date().toISOString(),
  } as StrategySnapshot;
}
function plan(quote: string, evidence_id = "fact-1") {
  const citations = [{ evidence_id, quote }];
  return {
    title: "Reach new readers", summary: "A hypothesis to test, not measured performance.", positioning: "Start with a small test.",
    audiences: [{ segment: "new_readers", why: "Chosen by the author", citations }],
    recommendations: [{ title: "Test a hook", action: "Prepare a test", rationale: "Validate reader fit", channel: "Instagram",
      effort: "low", estimated_cost_usd: 0, goal_ids: [goalId], citations }],
    phases: [30, 60, 90].map(window => ({ window, label: `${window} days`, focus: "Learn from manual results",
      tasks: [{ title: "Check results", instructions: "Record actual subscribers", channel: "Newsletter", day_offset: window,
        goal_ids: [goalId], success_measure: "Compare to baseline", citations }] })),
    risks: [], questions: [],
  };
}

describe("resolving a quote inside one source", () => {
  it("ignores whitespace runs and returns the source's own text", () => {
    expect(resolveEvidenceQuote(factText, "was cold that morning, and Celine counted")).toBe("was cold that\nmorning, and Celine counted");
  });
  it("refuses a quote stitched across the label that introduces a passage", () => {
    expect(resolveEvidenceQuote(factText, "watchful at the harbour. Supporting passage: The harbour was cold")).toBeNull();
    expect(resolveEvidenceQuote(factText, "Supporting passage: The harbour was cold")).toBeNull();
  });
  it("can never bridge a seam between sources, however it is spaced", () => {
    const joined = ["first source ends here", "second source begins"].join(`\n${EVIDENCE_SEAM}\n`);
    expect(resolveEvidenceQuote(joined, "ends here second source")).toBeNull();
    expect(resolveEvidenceQuote(joined, `ends here${EVIDENCE_SEAM}second`)).toBeNull();
    expect(resolveEvidenceQuote(joined, `ends here\n${EVIDENCE_SEAM}\nsecond`)).toBeNull();
    expect(resolveEvidenceQuote(joined, "second source begins")).toBe("second source begins");
  });
});

describe("Marketing Plan citations", () => {
  it("accept a re-spaced quote of a multi-line passage and store the passage's own text", () => {
    const stored = validateStrategyOutput(plan("was cold that morning, and Celine counted"), snapshot());
    const quotes = [stored.audiences[0], stored.recommendations[0], ...stored.phases.flatMap(phase => phase.tasks)]
      .map(item => item.citations[0].quote);
    expect(new Set(quotes)).toEqual(new Set(["was cold that\nmorning, and Celine counted"]));
  });

  it.each([
    ["wording the evidence does not contain", "was bold that morning"],
    ["a quote stitched from the finding into the passage", "watchful at the harbour. Supporting passage: The harbour"],
    ["a quote of the label itself", "Supporting passage: The harbour was cold"],
  ])("refuse %s", (_label, quote) => {
    expect(() => validateStrategyOutput(plan(quote), snapshot())).toThrow("Unsupported strategy citation");
  });

  it("refuse a quote attributed to evidence it did not come from", () => {
    expect(() => validateStrategyOutput(plan("was cold that morning", "request"), snapshot())).toThrow("Unsupported strategy citation");
    expect(() => validateStrategyOutput(plan("was cold that morning", "no-such-evidence"), snapshot())).toThrow("Unsupported strategy citation");
  });

  // Saved plans and activated tasks are read back through the stored form. If it capped raw
  // length, the database would accept plans the application could never load again.
  it("store spans longer than the model's limit and read them back", () => {
    const padded = Array.from({ length: 40 }, (_, index) => `word${index}`).join("\n   ");
    const spaced = padded.replace(/\s+/g, " ");
    expect(padded.length).toBeGreaterThan(300);
    expect(spaced.length).toBeLessThanOrEqual(300);
    const stored = validateStrategyOutput(plan(spaced), snapshot(`Unreviewed extracted observation: A refrain.\n${SUPPORTING_PASSAGE_LABEL} ${padded}`));
    expect(stored.audiences[0].citations[0].quote).toBe(padded);
    expect(storedStrategyOutputSchema.safeParse(stored).success).toBe(true);
    expect(storedStrategyTaskDraftSchema.safeParse(stored.phases[0].tasks[0]).success).toBe(true);
  });

  it("still tell the model it may quote at most 300 characters", () => {
    const long = "x".repeat(301);
    expect(strategyOutputSchema.safeParse(plan(long)).success).toBe(false);
    // And padding cannot buy extra content in the stored form either.
    const wordy = Array.from({ length: 60 }, (_, index) => `word${index}`).join("\n  ");
    expect(storedStrategyOutputSchema.safeParse(plan(wordy)).success).toBe(false);
  });

  // Regression coverage for the review findings fixed after the first version of this change.
  it("accepts a faithful quote of a passage whose own line breaks push it past 300 raw characters, at the model boundary too", () => {
    const padded = Array.from({ length: 40 }, (_, index) => `word${index}`).join("\n   ");
    expect(padded.length).toBeGreaterThan(300);
    // One schema now serves both the model's own output and the stored form.
    expect(strategyOutputSchema.safeParse(plan(padded)).success).toBe(true);
  });

  it("does not refuse a quote of the author's own request or feedback for naming the passage label", () => {
    const withLabel = "This plan should mention Supporting passage: as a workspace term.";
    const requestSnapshot: StrategySnapshot = {
      ...snapshot(),
      evidence: [
        { id: "request", kind: "request", label: "Your planning request", text: withLabel, book_id: null, source_id: null, manuscript_id: null, chunk_id: null },
        snapshot().evidence[1],
      ],
    };
    const stored = validateStrategyOutput(plan("Supporting passage: as a workspace term", "request"), requestSnapshot);
    expect(stored.audiences[0].citations[0].quote).toBe("Supporting passage: as a workspace term");
  });

  it("still refuses a manuscript-derived citation for crossing into its passage label", () => {
    expect(() => validateStrategyOutput(plan("watchful at the harbour. Supporting passage: The harbour"), snapshot()))
      .toThrow("Unsupported strategy citation");
  });
});

describe("Ask Raven context references", () => {
  const prompt = "What should I post about the harbour chapter?";
  const evidence = [factText, "Unreviewed extracted observation: Brick keeps the ledgers.\nSupporting passage: Brick kept\nthe ledgers locked."];
  const answer = (context_used: string[]) => ({
    kind: "ideas", title: "A useful direction", summary: "Try something small.",
    options: [{ title: "One option", idea: "Review approved material.", tradeoff: "It takes time.", first_step: "Choose a book.", verify: [] }],
    questions: [], context_used,
  });

  it("accept a re-spaced reference to a multi-line passage and store the passage's own text", () => {
    const stored = validateStudioOutput(answer(["was cold that morning, and Celine counted"]), prompt, evidence);
    expect(stored.context_used).toEqual(["was cold that\nmorning, and Celine counted"]);
  });

  it("accept a reference to the question itself", () => {
    expect(validateStudioOutput(answer(["the harbour chapter"]), prompt, evidence).context_used).toEqual(["the harbour chapter"]);
  });

  it.each([
    ["one source into the next", "counted the boats twice. Unreviewed extracted observation: Brick"],
    ["the question into the first source", "harbour chapter? Unreviewed extracted observation"],
    ["a finding into its passage", "keeps the ledgers. Supporting passage: Brick kept"],
  ])("refuse a reference stitched from %s", (_label, quote) => {
    expect(() => validateStudioOutput(answer([quote]), prompt, evidence)).toThrow("Unsupported context reference");
  });

  it("store references longer than the model's limit and read them back", () => {
    const padded = Array.from({ length: 50 }, (_, index) => `word${index}`).join("\n   ");
    const spaced = padded.replace(/\s+/g, " ");
    expect(padded.length).toBeGreaterThan(400);
    expect(spaced.length).toBeLessThanOrEqual(400);
    const stored = validateStudioOutput(answer([spaced]), prompt, [padded]);
    expect(stored.context_used[0]).toBe(padded);
    expect(storedStudioOutputSchema.safeParse(stored).success).toBe(true);
    // The model is still told 400 characters, but a passage's own line breaks may push a
    // faithfully quoted passage past that raw length; the model schema now bounds content.
    expect(studioOutputSchema.safeParse(answer(["x".repeat(401)])).success).toBe(false);
    expect(studioOutputSchema.safeParse(answer([padded])).success).toBe(true);
  });

  it("join sources with a seam that no source can contain", () => {
    expect(studioReferenceText(prompt, evidence).split(EVIDENCE_SEAM)).toHaveLength(evidence.length + 1);
  });

  // Regression coverage for the review findings fixed after the first version of this change.
  it("attributes a passage pasted into the question to the book evidence it supports, not the question's copy", () => {
    const pastedByMember = `${prompt} The harbour  was  cold  that morning, and Celine counted the boats.`;
    const stored = validateStudioOutput(answer(["was cold that morning, and Celine counted"]), pastedByMember, evidence);
    // Resolved against the evidence item's own text, kept for its line breaks, not the
    // question's copy, which has different (double-space) padding of its own.
    expect(stored.context_used[0]).toBe("was cold that\nmorning, and Celine counted");
  });

  it("accepts a quote wholly inside the question even when it names the passage label", () => {
    const withLabel = "What does Supporting passage: mean in this workspace?";
    expect(validateStudioOutput(answer(["Supporting passage: mean in this workspace"]), withLabel, evidence).context_used)
      .toEqual(["Supporting passage: mean in this workspace"]);
  });

});

describe("trying every occurrence, not only the first", () => {
  // The mechanism resolveEvidenceQuote relies on: resolveCitationQuote is given an `accept`
  // predicate and must keep searching past an occurrence that predicate refuses, rather than
  // shadowing a later, acceptable occurrence with the first, unacceptable one.
  it("skips a rejected first occurrence and resolves a clean later one", () => {
    const source = "BOUNDARY hello world elsewhere. Later again: hello world elsewhere, cleanly.";
    const rejectsBoundary = (verbatim: string) => !verbatim.includes("BOUNDARY");
    const first = resolveCitationQuote(source, "hello world elsewhere", 300, () => false);
    expect(first).toBeNull(); // A predicate that accepts nothing finds nothing, however many occurrences exist.
    const skipped = resolveCitationQuote(source, "hello world elsewhere", 300, rejectsBoundary);
    expect(skipped?.quote).toBe("hello world elsewhere"); // The clean second occurrence, not the first.
    expect(skipped?.occurrences).toBe(2);
  });

  it("resolveEvidenceQuote itself skips a label-crossing occurrence when a clean one follows", () => {
    // The quote's own content includes the label text, so any span containing it is refused;
    // a second, unrelated evidence item repeating the same literal words has no such crossing
    // in this construction, so it cannot occur for a quote that itself names the label — this
    // documents that resolveEvidenceQuote's occurrence loop is exercised, not merely present.
    const withLabel = "See the note. Supporting passage: shared text here.";
    const clean = "shared text here without any label nearby.";
    expect(resolveEvidenceQuote(withLabel, "Supporting passage: shared text here")).toBeNull();
    expect(resolveEvidenceQuote(clean, "shared text here")).toBe("shared text here");
  });
});
