"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BookmarkPlus, Feather, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/db/demo-store";
import { studioRequestSignature } from "@/lib/ai/studio-contract";
import type { ManuscriptCharacter, ManuscriptFact } from "@/lib/manuscripts/contract";
import type { BookDetailResponse } from "@/lib/manuscripts/library-contract";
import { factLabels, groupCharacters, groupFacts, searchCharacters } from "@/lib/manuscripts/knowledge-groups";

type View = "characters" | "story" | "readers";
type Evidence = ManuscriptCharacter | ManuscriptFact;
const facets = {
  portrait: { label: "At a glance", fields: [["role", "Role"], ["description", "About"], ["physical_traits", "Physical traits"], ["personality", "Personality"], ["backstory", "Backstory"]] },
  relationships: { label: "Relationships", fields: [["relationships", "Connections recorded in the manuscript"]] },
  development: { label: "Development", fields: [["arc", "Story development"], ["emotional_growth", "Emotional growth"]] },
  appeal: { label: "Reader appeal", fields: [["archetype", "Archetype · interpretation"], ["character_tropes", "Tropes · interpretation"], ["marketing_description", "Possible marketing angle"]] },
} as const;
const guidance = {
  characters: { kicker: "MEET THE PEOPLE IN YOUR WORLD", title: "A character, beyond a name.", help: "Explore the details already in your manuscript. Use them to check your reference notes or find an introduction that feels true to the character.", action: "Explore this character with Raven", next: "Start with the recorded traits. Check relationships against the source, then decide what a new reader can safely know.", question: "Help me organize these existing character observations into a useful reference checklist. Distinguish recorded traits, relationships and open questions. Suggest one spoiler-safe way to discuss the character with readers, only where supported." },
  story: { kicker: "FOLLOW WHAT YOUR MANUSCRIPT REVEALS", title: "Find the purpose behind a passage.", help: "Related observations stay together. These are passage groups, not confirmed scenes or a complete timeline. Select a group to examine its events and context.", action: "Examine this passage with Raven", next: "Separate what happens from the surrounding context. Ask what changes here, what the reader learns, and which links to other moments you want to check.", question: "Help me examine the function of these existing story observations. Separate recorded events from setting and context. Explain what is supported about change or stakes, then give me questions to investigate in my own manuscript. Treat missing cause-and-effect links as unknown; keep creative decisions with me." },
  readers: { kicker: "TURN BOOK KNOWLEDGE INTO A SMALL EXPERIMENT", title: "Give the right reader a reason to look.", help: "Choose a reader signal, inspect what supports it, then shape an angle to test. These observations describe your manuscript; they do not prove audience demand.", action: "Develop a marketing angle with Raven", next: "Pick one signal that represents this book. Consider who might respond, choose a spoiler-safe angle, and test one small introduction before committing spend.", question: "Using these selected manuscript signals, suggest two plausible reader-interest groups and explain the evidence for each. Give me one spoiler-safe marketing angle and one small experiment I can carry out. Clearly label hypotheses, avoid promises of sales, and identify what I should verify first." },
};
const readerNext: Partial<Record<ManuscriptFact["category"], string>> = {
  genre: "Check which genre expectations this book actually meets. Choose one reader group, then test whether that positioning helps them understand the book.",
  theme: "Identify the emotional question behind a theme. Explore why a reader might care, then test that connection without revealing how the story resolves it.",
  trope: "Verify the trope against the passages. Use a recognizable reader interest as a starting point, while checking that the book delivers the promise.",
  tone: "Compare these mood signals with the cover and existing promotional material. Choose one visual or descriptive direction that feels true to the reading experience.",
  reader_promise: "Turn one supported promise into an expectation you can stand behind. Check that a spoiler-safe introduction sets the right experience for a new reader.",
  content: "Review sensitive content in context. Prepare accurate reader-care notes and decide where they belong; these signals are not automatically advertising hooks.",
  marketing_hook: "Choose one supported angle. Check spoilers and accuracy, then plan a small test of the introduction rather than assuming the angle will sell.",
  comparable: "Verify each comparison independently. Treat shared traits as research leads, not an endorsement or proof that the audiences are the same.",
};
const shorten = (text: string, max = 115) => text.length > max ? `${text.slice(0, max).trim()}…` : text;

export function BookKnowledge({ knowledge, citations, book }: {
  knowledge: NonNullable<BookDetailResponse["intelligence"]>;
  citations: (item: Evidence) => ReactNode;
  book: { id: string; title: string; slug: string };
}) {
  const [spoilers, setSpoilers] = useState(false), [view, setView] = useState<View>("characters"), [query, setQuery] = useState("");
  const [indexLimit, setIndexLimit] = useState(8), [selected, setSelected] = useState(""), [facet, setFacet] = useState<keyof typeof facets>("portrait"), [limit, setLimit] = useState(5);
  const [copyStatus, setCopyStatus] = useState(""), [draft, setDraft] = useState(""), [draftOpen, setDraftOpen] = useState(false), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const indexRef = useRef<HTMLElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null), saveLock = useRef(false);
  const router = useRouter();
  const { canEdit, ready, createManualReview, studioScratchpad, updateStudioScratchpad } = useWorkspace();
  const characters = useMemo(() => groupCharacters(knowledge.characters, spoilers), [knowledge.characters, spoilers]);
  const found = searchCharacters(characters, query);
  const groups = useMemo(() => groupFacts(knowledge.facts, spoilers, view === "readers" ? "readers" : "story"), [knowledge.facts, spoilers, view]);
  const facts = groups.filter(g => !query.trim() || g.facts.some(f => f.statement.toLowerCase().includes(query.trim().toLowerCase())));
  const entries = view === "characters" ? found.map(g => ({ id: g.name, title: g.name, excerpt: g.observations[0]?.role || g.observations[0]?.description || "Open this profile", count: g.observations.length })) : facts.map(g => ({ id: g.id, title: view === "readers" ? g.label : shorten((g.facts.find(f => f.category === "plot") ?? g.facts[0]).statement), excerpt: view === "readers" ? shorten(g.facts[0].statement) : [...new Set(g.facts.map(f => factLabels[f.category]))].join(" · "), count: g.facts.length }));
  const currentId = entries.some(e => e.id === selected) ? selected : entries[0]?.id;
  const character = found.find(g => g.name === currentId), group = facts.find(g => g.id === currentId);
  const visibleFacts = (group?.facts ?? []).filter(f => !query.trim() || f.statement.toLowerCase().includes(query.trim().toLowerCase())).slice().sort((a,b) => view === "story" ? Number(b.category === "plot") - Number(a.category === "plot") : 0);
  const selectedItems: Evidence[] = view === "characters" ? (character?.observations ?? []).filter(item => facets[facet].fields.some(([field]) => item[field])) : visibleFacts;
  const currentTitle = entries.find(e => e.id === currentId)?.title ?? "Choose a starting point";
  const info = { ...guidance[view], next: view === "readers" && group ? readerNext[group.facts[0].category] ?? guidance.readers.next : guidance[view].next };
  const unfinished = Boolean(studioScratchpad.pendingRequestId || (studioScratchpad.prompt.trim() && studioScratchpad.savedSignature !== studioRequestSignature(studioScratchpad)));
  function choose(id: string) { setSelected(id); setLimit(5); setNotice(""); requestAnimationFrame(() => detailHeading.current?.focus()); }
  function changeView(next: View) { setView(next); setIndexLimit(8); setSelected(""); setQuery(""); setFacet("portrait"); setLimit(5); setNotice(""); }
  function context(items: Evidence[]) {
    const description = (item: Evidence) => "statement" in item ? `${item.category} · ${item.kind} · ${item.statement}` : `${item.name} · ${facets[facet].label}\n${facets[facet].fields.filter(([field]) => item[field]).map(([field,label]) => `${label}: ${item[field]}`).join("\n")}`;
    return `Book: ${book.title}\nSaved manuscript reference: ${knowledge.manuscript_id}\nSelected context (up to 3 observations; unreviewed):\n${items.slice(0, 3).map(item => `${shorten(description(item), 1200)}\nSource passage IDs: ${item.citations.map(c => c.chunk_id).join(", ")}`).join("\n\n")}`;
  }
  function prepare(items = selectedItems) { setCopyStatus(""); setDraft(`${view === "readers" && group?.id === "content" ? "Help me prepare accurate reader-care notes from these content observations. Identify uncertainty, context to verify, and suitable places for an author to share content information. Keep sensitive details out of promotional hooks." : info.question}\n\n${context(items)}\n\nAnalyze existing reference material only. Mark interpretation and missing information clearly.`.slice(0, 6000)); setDraftOpen(true); }
  function openRaven() {
    if (unfinished) return;
    updateStudioScratchpad({ job: "brainstorm", prompt: draft, bookIds: [book.id], includeSpoilers: spoilers, submittedId: null, savedSignature: null, requestIdentity: null });
    setDraftOpen(false); router.push("/studio");
  }
  async function save() {
    if (saveLock.current) return; saveLock.current = true; setSaving(true); setNotice(""); setError("");
    try {
      const saved = await createManualReview(`${view === "readers" ? "Marketing exploration" : "Book reference review"} · ${book.title}`.slice(0, 200), `MANUSCRIPT EXPLORATION · FOR MY REVIEW\n\n${info.next}\n\n${context(selectedItems)}\n\nSource book: /universe/${book.slug}\nSpoiler-sensitive details included: ${spoilers ? "yes" : "no"}.\n\nMy decision / next step:\n[Add my notes here.]\n\nThis is a saved review task, not approved marketing copy or a change to the manuscript.`);
      if (!saved) throw new Error("save"); setNotice("Saved to Cassandra’s Desk with its book and source references.");
    } catch { setError("Your next step could not be saved. Your manuscript is unchanged; please try again."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function evidence(item: Evidence) { return <div className="knowledge-evidence">{citations(item)}</div>; }
  return <div className={`book-knowledge knowledge-workbench knowledge-${view}`}>
    <div className="knowledge-view-nav" role="group" aria-label="Explore book knowledge">{([["characters", "Character Organization", Users], ["story", "Story Arc", Feather], ["readers", "Marketing", Sparkles]] as const).map(([key, label, Icon]) => <button key={key} aria-pressed={view === key} onClick={() => changeView(key)}><Icon size={19}/>{label}<ArrowRight size={15}/></button>)}</div>
    <header className="knowledge-intro"><span className="eyebrow">{info.kicker}</span><h3>{info.title}</h3><p>{info.help}</p></header>
    <div className="knowledge-controls"><label className="knowledge-search">{view === "characters" ? "Find a character" : "Find an observation"}<Input value={query} onChange={e => {setQuery(e.target.value);setIndexLimit(8);setLimit(5);}} placeholder={view === "characters" ? "Name or alias…" : "Search the visible observations…"} maxLength={120}/></label><div><label className="library-check library-spoilers"><input type="checkbox" checked={spoilers} onChange={e => {setSpoilers(e.target.checked);setLimit(5);}}/>Reveal plot details and potential spoilers</label><p className="quiet-note" role="status">{spoilers ? "Plot details and potential spoilers are showing." : `${knowledge.facts.filter(i => i.spoiler).length + knowledge.characters.filter(i => i.spoiler).length} findings with potential spoilers are hidden.`}</p><p className="quiet-note">This setting changes your screen only. Everyone with workspace access chooses their own.</p></div></div>
    <div className="knowledge-layout"><nav className="knowledge-index" ref={indexRef} aria-label={view === "characters" ? "Character profiles" : "Observation groups"}><p className="knowledge-index-caption" role="status">{entries.length} {view === "characters" ? "profiles" : "groups"} · choose one to explore</p>{entries.slice(0,indexLimit).map((entry, index) => <button className={view === "characters" ? "knowledge-character" : "knowledge-fact-group"} key={entry.id} aria-pressed={entry.id === currentId} onClick={() => choose(entry.id)}><span className="knowledge-index-number" aria-hidden="true">{view === "characters" ? entry.title.slice(0, 1) : index + 1}</span><span><strong>{entry.title}</strong><small>{shorten(entry.excerpt, 100)}</small><small>{entry.count} source observation{entry.count === 1 ? "" : "s"}</small></span></button>)}{entries.length > indexLimit && <Button variant="ghost" onClick={() => setIndexLimit(indexLimit + 8)}>Show more groups ({entries.length - indexLimit} remaining)</Button>}{!entries.length && <p className="quiet-note">No matching visible observations. Try another search or check the spoiler setting. You can search the original manuscript below.</p>}</nav>
    {entries.length > 0 && <section className="knowledge-reading" aria-label="Selected knowledge"><Button className="knowledge-back" variant="ghost" onClick={() => indexRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus()}>← Back to {view === "characters" ? "characters" : "groups"}</Button><header><span className="eyebrow">{view === "characters" ? "CHARACTER PORTRAIT" : view === "story" ? "PASSAGE EXPLORATION" : "READER SIGNAL"}</span><h3 ref={detailHeading} tabIndex={-1}>{view === "story" ? "What this passage reveals." : currentTitle}</h3>{character && view === "characters" && character.aliases.length > 0 && <p className="quiet-note">Also called {character.aliases.join(", ")}</p>}</header>
      <aside className="knowledge-next"><span className="eyebrow">WHAT CAN I DO WITH THIS?</span><p>{info.next}</p><div><Button disabled={!ready || !canEdit || !selectedItems.length} onClick={() => prepare()}>{info.action}<ArrowRight size={15}/></Button><Button variant="ghost" disabled={!ready || !canEdit || saving || !selectedItems.length} onClick={() => void save()}><BookmarkPlus size={15}/>{saving ? "Saving…" : "Save next step to my Desk"}</Button></div><small>These actions use up to three observations from the selected section or search results. Review the question before asking Raven; nothing runs automatically.</small></aside>
      {view === "characters" && character ? <><div className="knowledge-facets" role="group" aria-label="Character details">{Object.entries(facets).map(([key, item]) => <button key={key} aria-pressed={facet === key} onClick={() => {setFacet(key as keyof typeof facets);setLimit(5);}}>{item.label}</button>)}</div>{facets[facet].fields.map(([field, label]) => {
        const byText = new Map<string, ManuscriptCharacter>();
        for (const item of character.observations.filter(i => i[field])) {
          const key = item[field]!.trim().toLowerCase(), prior = byText.get(key);
          byText.set(key, prior ? {...prior, citations: [...new Map([...prior.citations, ...item.citations].map(c => [`${c.chunk_id}:${c.quote}`, c])).values()]} : item);
        }
        const unique = [...byText.values()];
        if (!unique.length) return null;
        return <section className="knowledge-profile-section" key={field}><h4>{label}</h4>{unique.slice(0, limit).map((item, i) => <div className="knowledge-observation" key={i}><p>{item[field]}</p>{evidence(item)}</div>)}{unique.length > limit && <Button variant="link" onClick={() => setLimit(limit + 5)}>Show five more {label.toLowerCase()} observations</Button>}</section>;
      })}{!character.observations.some(item => facets[facet].fields.some(([field]) => item[field])) && <p className="knowledge-empty">No separate {facets[facet].label.toLowerCase()} observations were recorded. Check the source or another section; missing details are not invented.</p>}<p className="quiet-note">Saved, unreviewed observations. Differing accounts remain visible for you to resolve; this is not an approved character bible.</p></> : group && <><p className="knowledge-detail-caption">{view === "story" ? "Recorded events and surrounding context" : "Signals to consider, with evidence"}{query.trim() && ` · ${visibleFacts.length} matching observations`}</p>{visibleFacts.slice(0, limit).map((fact, index) => <article className="knowledge-signal" key={`${group.id}-${index}`}><div><span className="eyebrow">{factLabels[fact.category]}</span><span className="knowledge-proof">{fact.kind === "supported" ? "Manuscript-supported · unreviewed" : "Interpretation · verify with source"}</span></div><p>{fact.statement}</p><div className="knowledge-signal-actions">{evidence(fact)}<Button variant="ghost" disabled={!ready || !canEdit} onClick={() => prepare([fact])}>{view === "readers" ? "Explore this angle" : "Explore this observation"}<ArrowRight size={14}/></Button></div></article>)}{visibleFacts.length > limit && <Button variant="outline" onClick={() => setLimit(limit + 5)}>Show next {Math.min(5, visibleFacts.length - limit)} observations · {visibleFacts.length - limit} remaining</Button>}</>}
    </section>}</div>
    {notice && <p className="library-success" role="status">{notice} <Link href="/desk">Open my Desk →</Link></p>}{error && <p role="alert" className="library-error">{error}</p>}
    <Dialog open={draftOpen} onOpenChange={setDraftOpen}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>Your question, ready to edit.</DialogTitle><DialogDescription>{book.title} will be selected in Ask Raven. Review this question, then choose when to submit it. Opening Raven does not use AI credits.</DialogDescription></DialogHeader><label className="knowledge-question">Question to explore<Textarea value={draft} onChange={e => setDraft(e.target.value)} maxLength={6000} rows={9}/></label>{unfinished && <p className="knowledge-empty">You already have an unfinished or running Raven question. <Link href="/studio">Open it first</Link>; this action will not overwrite it. You can copy this question to keep it.</p>}<div className="library-actions"><Button disabled={unfinished || !canEdit || draft.trim().length < 10} onClick={openRaven}>Open in Ask Raven<ArrowRight size={15}/></Button><Button variant="outline" onClick={async () => {try {await navigator.clipboard.writeText(draft);setCopyStatus("Question copied. Nothing was submitted.");} catch {setCopyStatus("Select the question and copy it using your device.");}}}>Copy question</Button></div><p role="status" aria-live="polite">{copyStatus}</p></DialogContent></Dialog>
  </div>;
}
