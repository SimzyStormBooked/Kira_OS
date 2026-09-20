import { describe, expect, it } from "vitest";
import { groupCharacters, groupFacts, searchCharacters } from "@/lib/manuscripts/knowledge-groups";
import type { ManuscriptCharacter, ManuscriptFact } from "@/lib/manuscripts/contract";
const citation = { chunk_id: "00000000-0000-4000-8000-000000000001", quote: "Synthetic evidence" };
const character = (name: string, extra: Partial<ManuscriptCharacter> = {}): ManuscriptCharacter => ({ name, aliases: [], role: "", description: "Synthetic observation", personality: "", relationships: "", arc: "", marketing_description: "", spoiler: false, citations: [citation], ...extra });
const fact = (category: ManuscriptFact["category"], extra: Partial<ManuscriptFact> = {}): ManuscriptFact => ({ category, statement: "Synthetic finding", kind: "supported", spoiler: false, citations: [citation], ...extra });
describe("manuscript knowledge presentation", () => {
  it("groups repeated names and explicit Brick/Bricks aliases without discarding observations or citations", () => {
    const items = [character("Bricks"), character(" Bricks "), character("Brick", { aliases: ["Bricks"] })];
    const groups = groupCharacters(items, false);
    expect(groups).toHaveLength(1); expect(groups[0].name).toBe("Brick"); expect(groups[0].observations).toHaveLength(3);
    for (const item of items) expect(groups[0].observations).toContain(item);
    expect(searchCharacters(groups, "BRICKS")).toHaveLength(1);
    expect(items[0].name).toBe("Bricks");
  });
  it("does not merge fuzzy names, shared aliases, or ambiguous aliases", () => {
    expect(groupCharacters([character("Glen"), character("Glenn")], false)).toHaveLength(2);
    expect(groupCharacters([character("A", { aliases: ["Captain"] }), character("B", { aliases: ["Captain"] }), character("Captain")], false)).toHaveLength(3);
  });
  it("filters spoilers before identity grouping, aliases and search", () => {
    const items = [character("A"), character("B"), character("A", { aliases: ["B", "Secret identity"], spoiler: true })];
    const hidden = groupCharacters(items, false);
    expect(hidden).toHaveLength(2); expect(searchCharacters(hidden, "Secret")).toHaveLength(0);
    expect(groupCharacters(items, true)).toHaveLength(1);
  });
  it("keeps related story observations in one source group and preserves each citation", () => {
    const items = [fact("plot"), fact("setting"), fact("plot", { citations: [{ ...citation, chunk_id: "other" }] })];
    const groups = groupFacts(items, false, "story");
    expect(groups).toHaveLength(2); expect(groups[0].facts).toEqual(items.slice(0, 2));
  });
  it("separates reader signals from plot, groups by interest category, and hides spoilers", () => {
    const items = [fact("plot"), fact("trope"), fact("trope"), fact("marketing_hook", { kind: "inference" }), fact("theme", { spoiler: true })];
    const groups = groupFacts(items, false, "readers");
    expect(groups.map(group => group.id)).toEqual(["trope", "marketing_hook"]);
    expect(groups[0].facts).toHaveLength(2); expect(groups[1].facts[0].kind).toBe("inference");
    expect(groupFacts(items, true, "readers")).toHaveLength(3);
  });
});
