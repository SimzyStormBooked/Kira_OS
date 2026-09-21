import "server-only";
import { z } from "zod";
import { runStudioProvider } from "@/lib/ai/provider";
import { STUDIO_MODEL, studioKnowledgeSchema, type StudioKnowledge } from "@/lib/ai/studio-contract";
import { StudioProviderError } from "@/lib/ai/studio-provider";
import { manuscriptFactSchema } from "@/lib/manuscripts/contract";
import { analyzeAds } from "./analysis";
import type { AdsSnapshot } from "./contract";
const booksSchema = z.array(z.object({ id: z.uuid(), title: z.string(), overview: z.string().nullable(), active_manuscript_id: z.uuid().nullable(), facts: manuscriptFactSchema.array().nullable() })).max(4);
export async function addBookAwareIdeas(snapshot: AdsSnapshot, rawBooks: unknown, jobId: string, allowed: boolean) {
  const books = booksSchema.parse(rawBooks);
  const evidence: StudioKnowledge = { book_ids: books.map(b => b.id), include_spoilers: false, evidence: [] };
  for (const book of books) {
    evidence.evidence.push({ id: `book-${book.id}`, kind: "book_metadata", label: `${book.title} · author-supplied catalog details`, text: `${book.title}\n${book.overview ?? "No description supplied."}`, book_id: book.id, source_id: null, manuscript_id: null, chunk_id: null });
    for (const [i, fact] of (book.facts ?? []).entries()) {
      if (fact.spoiler || !book.active_manuscript_id) continue;
      const citation = fact.citations[0];
      evidence.evidence.push({ id: `fact-${book.id}-${i}`, kind: "manuscript", label: `${book.title} · unreviewed ${fact.category}: ${fact.statement}`, text: citation.quote, book_id: book.id, source_id: null, manuscript_id: book.active_manuscript_id, chunk_id: citation.chunk_id });
    }
  }
  studioKnowledgeSchema.parse(evidence);
  const ai: NonNullable<AdsSnapshot["ai"]> = { model: STUDIO_MODEL, status: "unavailable", result: null, usage: null, evidence };
  if (!allowed || process.env.KIRA_AI_ENABLED !== "true") return { ...snapshot, ai };
  const analysis = analyzeAds(snapshot);
  const prompt = `Analyze this Facebook advertising report for an author. Give at most three practical, low-cost experiments tied to actual campaign evidence and the supplied book references where relevant. Describe hypotheses and missing tracking. Never equate cheaper clicks with profitable sales. Do not invent external advertisers or claim to browse. Avoid spoilers and manuscript excerpts in your suggestions; citations may use exact context. Keep the author's fiction hers. If no book references are available, say book-specific ideas require mapping a campaign to its book. Campaigns: ${JSON.stringify(analysis.campaigns.slice(0,3).map(c=>({name:c.name,objective:c.objective,recent:c.recent,prior:c.prior,status:c.status})))}`;
  try { const reply = await runStudioProvider({ id: jobId, job: "brainstorm", prompt, bookIds: evidence.book_ids, includeSpoilers: false }, evidence); return { ...snapshot, ai: { ...ai, status: "complete" as const, result: reply.result, usage: reply.usage } }; }
  catch (error) { return { ...snapshot, ai: { ...ai, status: "failed" as const, usage: error instanceof StudioProviderError ? error.usage : null } }; }
}
