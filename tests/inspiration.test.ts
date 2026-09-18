import { describe, expect, it } from "vitest";
import { findInspirationIdea, getDailyQuote, inspirationCategories, inspirationIdeas, literaryQuotes } from "@/lib/data/inspiration";

describe("curated inspiration and verified reading excerpts", () => {
  it("resolves only a known idea identifier, never arbitrary URL or query content", () => {
    for (const idea of inspirationIdeas) {
      expect(findInspirationIdea(idea.id)).toBe(idea);
      expect(idea.briefTitle.length).toBeLessThanOrEqual(200);
      expect(idea.briefDraft.length).toBeLessThanOrEqual(10000);
      expect(idea.briefDraft).toContain("CURATED REFLECTION");
      expect(idea.data_origin).toBe("manual");
    }
    for (const id of [undefined, null, "", "constructor", "__proto__", "return-to-a-title&action=approve", "https://example.com/", "../desk"])
      expect(findInspirationIdea(id)).toBeUndefined();
    expect(new Set(inspirationIdeas.map((idea) => idea.id)).size).toBe(inspirationIdeas.length);
    for (const category of inspirationCategories) expect(inspirationIdeas.some((idea) => idea.category === category)).toBe(true);
  });

  it("keeps quote selection deterministic without consulting the browser clock", () => {
    expect(getDailyQuote()).toBe(getDailyQuote());
    expect(getDailyQuote("")).toBe(getDailyQuote());
    const selections = new Set<string>();
    for (let day = 1; day <= 28; day += 1) {
      const date = `2026-09-${String(day).padStart(2, "0")}`;
      const quote = getDailyQuote(date);
      expect(getDailyQuote(date)).toBe(quote);
      selections.add(quote.id);
    }
    expect(selections.size).toBe(literaryQuotes.length);
  });

  it("keeps each literary excerpt short, attributed, and linked to a primary edition", () => {
    for (const quote of literaryQuotes) {
      const source = new URL(quote.sourceUrl);
      expect(source.protocol).toBe("https:");
      expect(source.hostname).toBe("www.gutenberg.org");
      expect(source.pathname).toMatch(/^\/files\/\d+\/\d+-h\/\d+-h\.htm$/);
      expect(quote.text.split(/\s+/).length).toBeLessThanOrEqual(25);
      expect(quote.context.length).toBeGreaterThan(30);
      expect(quote.location).toContain("Chapter");
      expect(quote.data_origin).toBe("public_verified");
    }
  });
});
