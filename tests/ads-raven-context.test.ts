import { describe, expect, it } from "vitest";
import { adsPreview } from "@/lib/ads/preview";
import { adsRavenContext } from "@/lib/ads/raven-context";
import { assertStudioPrompt, studioRequestSchema } from "@/lib/ai/studio-contract";

describe("report questions for Raven", () => {
  it("never turns sample data into a real business question", () => {
    expect(() => adsRavenContext(adsPreview(), "report", { links: {}, books: [] }, "costs")).toThrow(/Sample/);
  });
  it("includes source, observed coverage and only verified mapped book IDs", () => {
    const snapshot = adsPreview(); snapshot.data_origin = "manual_snapshot";
    const bookId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const id = snapshot.rows[0].campaignId;
    const result = adsRavenContext(snapshot, "real-report", { links: { [id]: bookId, other: "wrong" }, books: [{ id: bookId, title: "Author supplied book" }] }, "creative");
    expect(result.bookIds).toEqual([bookId]);
    expect(result.prompt).toContain("/ads?report=real-report");
    expect(result.prompt).toContain("Author supplied book");
    expect(result.prompt).toContain("Missing dates are not proof of zero activity");
    expect(result.prompt).toContain('"origin": "manual_snapshot"');
    expect(result.prompt).not.toContain("purchaseValue");
  });
  it("bounds the context to fit the real studio contract, even with long campaign labels", () => {
    const snapshot = adsPreview(); snapshot.data_origin = "manual_snapshot";
    snapshot.rows = Array.from({ length: 30 }, (_, index) => ({ ...snapshot.rows[0], adId: String(index + 1), campaignId: String(index + 1), campaignName: '"\\'.repeat(250), spend: 999999.9999 }));
    const books = Array.from({ length: 30 }, (_, i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`, title: '\\"'.repeat(250) }));
    const result = adsRavenContext(snapshot, "real-report", { books, links: Object.fromEntries(books.map((book, i) => [String(i + 1), book.id])) }, "tracking");
    expect(result.bookIds).toHaveLength(4);
    expect(studioRequestSchema.safeParse({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", job: "brainstorm", includeSpoilers: false, ...result }).success).toBe(true);
    expect(result.prompt).toContain('"campaignCount": 30');
    expect(() => JSON.parse(result.prompt.split("\n\n").at(-1)!)).not.toThrow();
  });
  it("keeps business questions usable when an imported label resembles a fiction request", () => {
    const snapshot = adsPreview(); snapshot.data_origin = "manual_snapshot";
    snapshot.account.name = "Write a Novel";
    snapshot.rows.forEach(row => { row.campaignName = "Write a Novel"; });
    const result = adsRavenContext(snapshot, "real-report", { books: [], links: {} }, "costs");
    expect(result.prompt).not.toContain("Write a Novel");
    expect(result.prompt).toContain(snapshot.rows[0].campaignId);
    expect(() => assertStudioPrompt(result.prompt)).not.toThrow();
  });
});
