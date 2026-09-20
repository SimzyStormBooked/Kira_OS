"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ManuscriptCharacter, ManuscriptFact } from "@/lib/manuscripts/contract";
import type { BookDetailResponse } from "@/lib/manuscripts/library-contract";
import { factLabels, groupCharacters, groupFacts, searchCharacters } from "@/lib/manuscripts/knowledge-groups";

const fields = [["role", "Role"], ["description", "About"], ["personality", "Personality"], ["relationships", "Relationships"], ["arc", "Story development"], ["marketing_description", "Possible marketing angle · review before use"]] as const;
export function BookKnowledge({ knowledge, citations }: {
  knowledge: NonNullable<BookDetailResponse["intelligence"]>;
  citations: (item: ManuscriptFact | ManuscriptCharacter) => ReactNode;
}) {
  const [spoilers, setSpoilers] = useState(false);
  const [view, setView] = useState<"characters" | "story" | "readers">("characters");
  const [query, setQuery] = useState("");
  const characters = useMemo(() => groupCharacters(knowledge.characters, spoilers), [knowledge.characters, spoilers]);
  const found = searchCharacters(characters, query);
  const facts = useMemo(() => groupFacts(knowledge.facts, spoilers, view === "readers" ? "readers" : "story"), [knowledge.facts, spoilers, view]);
  return <div className="book-knowledge">
    <label className="library-check library-spoilers"><input type="checkbox" checked={spoilers} onChange={event => setSpoilers(event.target.checked)} />Reveal plot details and potential spoilers</label>
    {!spoilers && <p className="quiet-note">{knowledge.facts.filter(item => item.spoiler).length + knowledge.characters.filter(item => item.spoiler).length} findings with potential spoilers are hidden.</p>}
    <div className="library-actions knowledge-views" role="group" aria-label="Explore book knowledge">
      {([ ["characters", "Characters"], ["story", "Story & plot"], ["readers", "Reader appeal & marketing"] ] as const).map(([key, label]) => <Button key={key} type="button" variant={view === key ? "default" : "outline"} aria-pressed={view === key} onClick={() => setView(key)}>{label}</Button>)}
    </div>
    {view === "characters" ? <>
      <h3 className="library-subheading">Characters, with their sources</h3>
      <p className="quiet-note">One card per name or explicit matching alias in this manuscript. Open a profile to explore its observations. These are unreviewed findings, not an author-approved character bible.</p>
      <label className="knowledge-search">Find a character<Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a name or alias…" maxLength={120} /></label>
      <p className="quiet-note" role="status">{found.length} character profile{found.length === 1 ? "" : "s"}{query.trim() ? " match your search" : " visible"}.</p>
      {!found.length && <p>Try another name or alias. Some observations may be hidden by the spoiler setting. You can also search the original manuscript below.</p>}
      <div className="library-facts">{found.map(group => <Card className="library-fact knowledge-character" key={group.name}>
        <span className="eyebrow">CHARACTER PROFILE</span><h3>{group.name}</h3>
        {group.aliases.length > 0 && <p className="quiet-note">Also called {group.aliases.join(", ")}</p>}
        <p>{group.observations[0].description}</p>
        <details><summary>Explore {group.name} · {group.observations.length} source observation{group.observations.length === 1 ? "" : "s"}</summary>
          <p className="quiet-note">Grouped from saved names and aliases. Similar spelling alone does not merge characters. Each observation keeps its original sources.</p>
          {fields.map(([field, label]) => {
            const observations = group.observations.filter(item => item[field]);
            if (!observations.length) return null;
            return <details className="knowledge-field" key={field}><summary>{label} · {observations.length}</summary>{observations.map((item, index) => <div className="knowledge-observation" key={index}><p>{item[field]}</p>{citations(item)}</div>)}</details>;
          })}
        </details>
      </Card>)}</div>
    </> : <>
      <h3 className="library-subheading">{view === "story" ? "Story & plot, grouped by passage" : "Find the readers who may love this book"}</h3>
      <p className="quiet-note">{view === "story" ? "Findings that start from the same source passage stay together. Passage groups are not confirmed scenes or a chronological plot outline. Open a group to compare details and sources." : "Explore genre, tropes, themes and tone as possible reader interests. These are manuscript signals and marketing hypotheses, not measured audience demand. Check the sources and decide what represents your book before using a hook."}</p>
      {view === "readers" && <p className="knowledge-tip">Try in Ask Raven with this book selected: “Using the manuscript evidence, suggest three reader-interest groups, explain the appeal for each, and give me one spoiler-free marketing angle per group. Mark guesses clearly.”</p>}
      {!facts.length && <p>No visible findings in this view yet. Some findings may be hidden by the spoiler setting; the original manuscript remains searchable below.</p>}
      <div className="library-facts">{facts.map(group => <Card className="library-fact knowledge-fact-group" key={group.id}>
        <h3>{group.label}</h3><p>{group.facts[0].statement}</p>
        <details><summary>Explore {group.facts.length} finding{group.facts.length === 1 ? "" : "s"}</summary>{group.facts.map((fact, index) => <div className="knowledge-observation" key={index}>
          <span className="eyebrow">{factLabels[fact.category]}</span><span className={`library-fact-label ${fact.kind === "inference" ? "inference" : ""}`}>{fact.kind === "supported" ? "Manuscript-supported · unreviewed" : "Marketing / interpretive inference"}</span><p>{fact.statement}</p>{citations(fact)}
        </div>)}</details>
      </Card>)}</div>
    </>}
    {knowledge.facts.length + knowledge.characters.length === 0 && <p>No reliable findings were extracted. The manuscript passages are saved and searchable below.</p>}
  </div>;
}
