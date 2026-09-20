import type { ManuscriptCharacter, ManuscriptFact } from "./contract";

export const knowledgeKey = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
export type CharacterGroup = { name: string; aliases: string[]; observations: ManuscriptCharacter[] };

/** Presentation only: original observations and their citations are never rewritten. */
export function groupCharacters(characters: ManuscriptCharacter[], spoilers: boolean): CharacterGroup[] {
  const visible = characters.filter(item => spoilers || !item.spoiler);
  const names = new Map<string, ManuscriptCharacter[]>();
  for (const item of visible) {
    const key = knowledgeKey(item.name);
    names.set(key, [...(names.get(key) ?? []), item]);
  }
  const parents = new Map([...names.keys()].map(key => [key, key]));
  const root = (key: string): string => {
    let current = key;
    while (parents.get(current) !== current) current = parents.get(current)!;
    return current;
  };
  const owners = new Map<string, Set<string>>();
  for (const [name, items] of names) for (const alias of items.flatMap(item => item.aliases)) {
    const key = knowledgeKey(alias);
    if (key !== name) owners.set(key, new Set([...(owners.get(key) ?? []), name]));
  }
  // Only a unique explicit alias that is itself a saved character name can join names.
  // Shared nicknames, fuzzy spelling and similar roles are not identity evidence.
  for (const [alias, sources] of owners) {
    if (!names.has(alias) || sources.size !== 1) continue;
    const source = [...sources][0];
    const a = root(alias); const b = root(source);
    if (a !== b) parents.set(a, b);
  }
  const groups = new Map<string, ManuscriptCharacter[]>();
  for (const [name, items] of names) {
    const key = root(name); groups.set(key, [...(groups.get(key) ?? []), ...items]);
  }
  return [...groups.values()].map(observations => {
    const allNames = [...new Set(observations.map(item => item.name))].sort((a, b) => a.length - b.length || a.localeCompare(b));
    const name = allNames[0];
    const aliases = new Map<string, string>();
    for (const alias of [...allNames, ...observations.flatMap(item => item.aliases)]) {
      if (knowledgeKey(alias) !== knowledgeKey(name)) aliases.set(knowledgeKey(alias), alias);
    }
    return { name, aliases: [...aliases.values()], observations };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function searchCharacters(groups: CharacterGroup[], query: string) {
  const needle = knowledgeKey(query);
  return groups.filter(group => [group.name, ...group.aliases].some(name => knowledgeKey(name).includes(needle)));
}

export const readerCategories = new Set<ManuscriptFact["category"]>(["genre", "theme", "trope", "tone", "reader_promise", "content", "marketing_hook", "comparable"]);
export const factLabels: Record<ManuscriptFact["category"], string> = {
  genre: "Genre signals", theme: "Themes readers may connect with", trope: "Tropes & reader interests",
  tone: "Mood & tone", reader_promise: "Reader promise", content: "Content considerations",
  marketing_hook: "Possible marketing hooks", comparable: "Comparable titles to verify",
  setting: "Setting", plot: "Plot events", synopsis: "Story overview",
};
export function groupFacts(facts: ManuscriptFact[], spoilers: boolean, view: "story" | "readers") {
  const groups = new Map<string, { id: string; label: string; facts: ManuscriptFact[] }>();
  for (const fact of facts) {
    if ((!spoilers && fact.spoiler) || readerCategories.has(fact.category) !== (view === "readers")) continue;
    // A passage is evidence of proximity, not proof of a scene boundary.
    const id = view === "readers" ? fact.category : fact.citations[0].chunk_id;
    const group = groups.get(id) ?? { id, label: view === "readers" ? factLabels[fact.category] : `Passage group ${groups.size + 1}`, facts: [] };
    group.facts.push(fact); groups.set(id, group);
  }
  return [...groups.values()];
}
