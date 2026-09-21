import { z } from "zod";

export const MANUSCRIPT_MAX_BYTES = 4 * 1024 * 1024;
export const MANUSCRIPT_MAX_TEXT = 1_500_000;
export const MANUSCRIPT_MAX_CHUNKS = 500;
export const MANUSCRIPT_CHUNK_SIZE = 4000;
export const MANUSCRIPT_BATCH_SIZE = 4;
export const MANUSCRIPT_PARSER_VERSION = "kira-text-v1";
export const MANUSCRIPT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const MANUSCRIPT_EMBEDDING_DIMENSIONS = 1536;
export const manuscriptFormats = ["txt", "md", "docx", "pdf", "epub"] as const;
export type ManuscriptFormat = (typeof manuscriptFormats)[number];
const mimeTypes: Record<ManuscriptFormat, readonly string[]> = {
  txt: ["text/plain"], md: ["text/markdown", "text/x-markdown", "text/plain"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
  pdf: ["application/pdf"], epub: ["application/epub+zip", "application/zip"],
};
/** Extension and MIME must agree; binary signatures are checked by the server parser. */
export function manuscriptFormat(filename: string, mime: string): ManuscriptFormat | null {
  if (!filename || filename.length > 255 || /[\u0000-\u001f/\\]/.test(filename)) return null;
  const extension = filename.split(".").pop()?.toLowerCase() as ManuscriptFormat;
  if (!manuscriptFormats.includes(extension)) return null;
  const type = mime.split(";", 1)[0].trim().toLowerCase();
  return !type || type === "application/octet-stream" || mimeTypes[extension].includes(type) ? extension : null;
}
export const manuscriptChunkSchema = z.object({
  id: z.uuid(), chunk_index: z.number().int().min(0).max(MANUSCRIPT_MAX_CHUNKS - 1),
  section: z.string().min(1).max(200), reference_text: z.string().min(1).max(MANUSCRIPT_CHUNK_SIZE),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ManuscriptChunk = z.infer<typeof manuscriptChunkSchema>;
export interface ParsedManuscript { chunks: ManuscriptChunk[]; textHash: string; parserVersion: string }
export const manuscriptCitationSchema = z.object({ chunk_id: z.uuid(), quote: z.string().trim().min(1).max(300) }).strict();
const citations = z.array(manuscriptCitationSchema).min(1).max(4);
export const manuscriptFactSchema = z.object({
  category: z.enum(["genre", "synopsis", "theme", "trope", "tone", "setting", "plot", "reader_promise", "content", "marketing_hook", "comparable"]),
  statement: z.string().trim().min(1).max(600), kind: z.enum(["supported", "inference"]),
  spoiler: z.boolean(), citations,
}).strict();
export const manuscriptCharacterSchema = z.object({
  name: z.string().trim().min(1).max(120), aliases: z.array(z.string().trim().min(1).max(120)).max(8),
  role: z.string().trim().max(160), description: z.string().trim().max(600), personality: z.string().trim().max(400),
  relationships: z.string().trim().max(600), arc: z.string().trim().max(600), marketing_description: z.string().trim().max(400),
  physical_traits: z.string().trim().max(400).optional(), backstory: z.string().trim().max(400).optional(),
  archetype: z.string().trim().max(400).optional(), character_tropes: z.string().trim().max(400).optional(), emotional_growth: z.string().trim().max(400).optional(),
  spoiler: z.boolean(), citations,
}).strict();
export const manuscriptExtractionSchema = z.object({
  facts: z.array(manuscriptFactSchema).max(16), characters: z.array(manuscriptCharacterSchema).max(8),
}).strict();
export type ManuscriptFact = z.infer<typeof manuscriptFactSchema>;
export type ManuscriptCharacter = z.infer<typeof manuscriptCharacterSchema>;
export type ManuscriptExtraction = z.infer<typeof manuscriptExtractionSchema>;
export const manuscriptUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
  embeddingTokens: z.number().int().nonnegative().nullable(), estimatedCostUsd: z.number().nonnegative().nullable(),
  gatewayGenerationId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).nullable(),
  embeddingGenerationId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).nullable(),
  embedding_status: z.enum(["not_started", "complete", "unavailable"]),
}).strict();
export type ManuscriptUsage = z.infer<typeof manuscriptUsageSchema>;
export interface ManuscriptEmbedding { chunk_id: string; embedding: number[]; model: string }
export interface ManuscriptExtractionReply {
  result: ManuscriptExtraction; usage: ManuscriptUsage; embeddings: ManuscriptEmbedding[];
}
/** Citations must be from this exact batch. All accepted items remain unreviewed candidates. */
export function validateManuscriptExtraction(value: unknown, chunks: ManuscriptChunk[]): ManuscriptExtraction {
  const output = manuscriptExtractionSchema.parse(value);
  const known = new Map(chunks.map(chunk => [chunk.id, chunk.reference_text]));
  for (const item of [...output.facts, ...output.characters]) {
    for (const citation of item.citations) {
      if (!known.get(citation.chunk_id)?.includes(citation.quote)) throw new Error("Unsupported manuscript citation");
    }
  }
  return output;
}

/** One unsupported candidate must not discard independently verified findings.
 * Reject whole candidates, not individual citations: removing a citation could
 * leave part of a multi-claim observation without its intended support.
 * Malformed envelopes and entirely unsupported nonempty results still fail.
 */
export function selectVerifiedManuscriptExtraction(value: unknown, chunks: ManuscriptChunk[]): ManuscriptExtraction {
  const output = manuscriptExtractionSchema.parse(value);
  const known = new Map(chunks.map(chunk => [chunk.id, chunk.reference_text]));
  const supported = (item: ManuscriptFact | ManuscriptCharacter) =>
    item.citations.every(citation => known.get(citation.chunk_id)?.includes(citation.quote));
  const result = { facts: output.facts.filter(supported), characters: output.characters.filter(supported) };
  if (output.facts.length + output.characters.length > 0 && result.facts.length + result.characters.length === 0)
    throw new Error("No supported manuscript citations");
  return validateManuscriptExtraction(result, chunks);
}
