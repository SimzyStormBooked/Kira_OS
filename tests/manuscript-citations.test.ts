import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MANUSCRIPT_QUOTE_MAX, MANUSCRIPT_STORED_QUOTE_MAX,
  normalizeQuoteWhitespace, resolveCitationQuote,
} from "@/lib/manuscripts/citations";
import { manuscriptCitationSchema, manuscriptExtractionSchema, selectVerifiedManuscriptExtraction, validateManuscriptExtraction } from "@/lib/manuscripts/contract";

// Extracted PDF text keeps the page's line breaks and padding; a model re-quotes the same
// words with ordinary spacing. These fixtures reproduce that shape, not real manuscript text.
const pdfLike = "The harbour  was cold that\nmorning, and Celine counted\n  the boats twice before she\nspoke.";
const chunkId = randomUUID();
const otherChunkId = randomUUID();
const chunk = (reference_text: string, id = chunkId) => ({
  id, chunk_index: 0, section: "Chapter 1", reference_text,
  content_hash: createHash("sha256").update(reference_text).digest("hex"),
});
const fact = (quote: string, id = chunkId) => ({
  category: "theme" as const, statement: "The passage establishes a cold harbour.", kind: "supported" as const,
  spoiler: false, citations: [{ chunk_id: id, quote }],
});
const character = (quote: string, id = chunkId) => ({
  name: "Celine", aliases: [], role: "Counter of boats", description: "A character named in the passage.",
  personality: "", relationships: "", arc: "", marketing_description: "", spoiler: false,
  citations: [{ chunk_id: id, quote }],
});
const extraction = (facts: unknown[], characters: unknown[] = []) => ({ facts, characters });

describe("resolving a re-quoted passage", () => {
  it("collapses whitespace runs for matching and returns the source's own text", () => {
    const resolved = resolveCitationQuote(pdfLike, "was cold that morning, and Celine counted the boats");
    expect(resolved).not.toBeNull();
    // What is stored carries the source's line breaks, not the model's spacing.
    expect(resolved!.quote).toBe("was cold that\nmorning, and Celine counted\n  the boats");
    expect(pdfLike).toContain(resolved!.quote);
    expect(normalizeQuoteWhitespace(resolved!.quote)).toBe("was cold that morning, and Celine counted the boats");
    expect(resolved!.occurrences).toBe(1);
  });

  it("still matches when the source and the quote agree exactly", () => {
    const plain = "She counted the boats twice.";
    expect(resolveCitationQuote(plain, "counted the boats")?.quote).toBe("counted the boats");
  });

  it.each([
    ["a tab", "the\tboats"],
    ["a carriage return", "the\r\nboats"],
    ["a non-breaking space", "the boats"],
    ["several blank lines", "the\n\n\nboats"],
    ["padding either side", "   the boats   "],
  ])("treats %s as ordinary spacing", (_label, source) => {
    expect(resolveCitationQuote(`before ${source} after`, "the boats")?.quote.replace(/\s+/g, " ").trim()).toBe("the boats");
  });

  it("resolves a quote whose own edges carry stray spacing", () => {
    expect(resolveCitationQuote(pdfLike, "  \n counted\n the boats \t")?.quote).toBe("counted\n  the boats");
  });

  it.each([
    ["a changed letter", "was bold that morning"],
    ["added words", "was cold that frozen morning"],
    ["reordered words", "that cold was morning"],
    ["a different case", "WAS COLD THAT MORNING"],
    ["text that is simply absent", "she never spoke of it again"],
    ["punctuation the source lacks", "was cold; that morning"],
  ])("rejects %s", (_label, quote) => {
    expect(resolveCitationQuote(pdfLike, quote)).toBeNull();
  });

  it("rejects an empty or whitespace-only quote", () => {
    expect(resolveCitationQuote(pdfLike, "   \n ")).toBeNull();
    expect(resolveCitationQuote(pdfLike, "")).toBeNull();
  });

  it("rejects more content than the model is allowed to quote", () => {
    const long = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
    expect(normalizeQuoteWhitespace(long).length).toBeGreaterThan(MANUSCRIPT_QUOTE_MAX);
    expect(resolveCitationQuote(long, long)).toBeNull();
  });

  it("rejects a span whose stored form would exceed the storage ceiling", () => {
    // Pathological padding: little content, enormous whitespace between each word.
    const padded = ["alpha", "beta", "gamma"].join("\n".repeat(1100));
    const resolved = resolveCitationQuote(padded, "alpha beta gamma");
    expect(padded.length).toBeGreaterThan(MANUSCRIPT_STORED_QUOTE_MAX);
    expect(resolved).toBeNull();
  });

  it("resolves a repeated line to its first occurrence and reports the repeat", () => {
    const repeated = "Get out, she said.\nHe stayed.\nGet  out, she said.";
    const resolved = resolveCitationQuote(repeated, "Get out, she said.");
    expect(resolved).toMatchObject({ quote: "Get out, she said.", start: 0, occurrences: 2 });
    expect(repeated).toContain(resolved!.quote);
  });

  it("does not match across a passage it was not given", () => {
    expect(resolveCitationQuote("", "the boats")).toBeNull();
  });
});

describe("validating an extraction against its batch", () => {
  const chunks = [chunk(pdfLike)];

  it("accepts a whitespace-divergent citation and stores the source's text", () => {
    const result = validateManuscriptExtraction(extraction([fact("was cold that morning")]), chunks);
    expect(result.facts[0].citations[0].quote).toBe("was cold that\nmorning");
    expect(pdfLike).toContain(result.facts[0].citations[0].quote);
  });

  it("is idempotent, so a stored citation revalidates unchanged", () => {
    const once = validateManuscriptExtraction(extraction([fact("counted the boats")]), chunks);
    const twice = validateManuscriptExtraction(once, chunks);
    expect(twice.facts[0].citations[0].quote).toBe(once.facts[0].citations[0].quote);
  });

  // A stored span is longer than the content the model quoted. Everything that reads a
  // saved profile back parses it with this same schema, so if the schema capped the raw
  // length the database would accept rows the application could never load again.
  it("accepts, stores and re-reads a span longer than the content limit", () => {
    const padded = Array.from({ length: 40 }, (_, index) => `word${index}`).join("\n   ");
    const spaced = padded.replace(/\s+/g, " ");
    expect(padded.length).toBeGreaterThan(300);
    expect(spaced.length).toBeLessThanOrEqual(MANUSCRIPT_QUOTE_MAX);
    const stored = validateManuscriptExtraction(extraction([fact(spaced)]), [chunk(padded)]);
    const quote = stored.facts[0].citations[0].quote;
    expect(quote).toBe(padded);
    expect(quote.length).toBeGreaterThan(300);
    // The read-back path: every consumer of a saved profile parses it with this schema.
    expect(manuscriptExtractionSchema.safeParse(stored).success).toBe(true);
    expect(validateManuscriptExtraction(stored, [chunk(padded)])).toEqual(stored);
  });

  it("bounds a quote by its content however it is spaced", () => {
    const wordy = Array.from({ length: 60 }, (_, index) => `word${index}`).join(" ");
    expect(wordy.length).toBeGreaterThan(MANUSCRIPT_QUOTE_MAX);
    expect(manuscriptCitationSchema.safeParse({ chunk_id: chunkId, quote: wordy }).success).toBe(false);
    // Padding cannot buy extra content, and raw length is still bounded.
    expect(manuscriptCitationSchema.safeParse({ chunk_id: chunkId, quote: wordy.replace(/ /g, "\n  ") }).success).toBe(false);
    expect(manuscriptCitationSchema.safeParse({ chunk_id: chunkId, quote: "a".repeat(10) + " ".repeat(MANUSCRIPT_STORED_QUOTE_MAX) + "b" }).success).toBe(false);
  });

  it("rejects the whole extraction when any citation is unsupported", () => {
    expect(() => validateManuscriptExtraction(extraction([fact("she never spoke of it")]), chunks))
      .toThrow("Unsupported manuscript citation");
    expect(() => validateManuscriptExtraction(extraction([fact("the boats", otherChunkId)]), chunks))
      .toThrow("Unsupported manuscript citation");
  });

  it("keeps supported findings when another candidate is unsupported", () => {
    const value = extraction(
      [fact("was cold that morning"), fact("an invented claim entirely")],
      [character("counted the boats")],
    );
    const result = selectVerifiedManuscriptExtraction(value, chunks);
    expect(result.facts).toHaveLength(1);
    expect(result.characters).toHaveLength(1);
    expect(result.facts[0].citations[0].quote).toBe("was cold that\nmorning");
    expect(result.characters[0].citations[0].quote).toBe("counted\n  the boats");
  });

  it("fails when a nonempty extraction supports nothing", () => {
    expect(() => selectVerifiedManuscriptExtraction(extraction([fact("nothing like this appears")]), chunks))
      .toThrow("No supported manuscript citations");
  });

  it("accepts an empty extraction and rejects a malformed envelope", () => {
    expect(selectVerifiedManuscriptExtraction(extraction([]), chunks)).toEqual({ facts: [], characters: [] });
    expect(() => selectVerifiedManuscriptExtraction({ facts: [] }, chunks)).toThrow();
    expect(() => selectVerifiedManuscriptExtraction(extraction([{ ...fact("was cold"), category: "invented" }]), chunks)).toThrow();
  });

  it("attributes each citation to its own passage", () => {
    const second = chunk("A different page entirely, with\nits own harbour.", otherChunkId);
    const result = validateManuscriptExtraction(
      extraction([fact("was cold that morning")], [character("its own harbour", otherChunkId)]),
      [chunks[0], second],
    );
    expect(result.characters[0].citations[0].quote).toBe("its own harbour");
    expect(() => validateManuscriptExtraction(extraction([fact("its own harbour", chunkId)]), [chunks[0], second]))
      .toThrow("Unsupported manuscript citation");
  });
});
