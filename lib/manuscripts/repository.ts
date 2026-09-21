import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { libraryBookSchema, librarySeriesSchema, type LibraryInput } from "./library-contract";
import { ManuscriptError } from "./http";

const bookColumns = "id,slug,title,series_id,series_order,source_id,overview,metadata,verified_at,verification_status,data_origin,active_manuscript_id,updated_at";
export const storedManuscriptSchema = z.object({
  id: z.uuid(), author_id: z.uuid(), book_id: z.uuid(), source_id: z.uuid(), asset_id: z.uuid(),
  filename: z.string(), mime_type: z.string(), size_bytes: z.number(), content_hash: z.string(),
  storage_path: z.string(), version: z.number(), status: z.enum(["uploading", "queued", "processing", "ready", "failed"]),
  chunk_count: z.number(), completed_chunks: z.number().default(0), error_code: z.string().nullable(), created_at: z.string(),
});
export type StoredManuscript = z.infer<typeof storedManuscriptSchema>;
export const storedChunkSchema = z.object({
  id: z.uuid(), chunk_index: z.number(), section: z.string(), reference_text: z.string(), content_hash: z.string(),
});
export function checkLibraryError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const messages: Record<string, [number, string]> = {
    "42501": [403, "You do not have permission to change this book or manuscript."],
    "P0002": [404, "This book or manuscript is unavailable in your workspace."],
    "40001": [409, "This item changed. Reload it before trying again."],
    "55P03": [409, "A reading step is still in progress. Wait a moment, then resume."],
    "54000": [429, "The workspace has reached its reading limit for today. Resume tomorrow; completed work is saved."],
    "22023": [400, "These book or manuscript details could not be saved. Check the fields and try again."],
    "23505": [409, "A matching record already exists. Reload before trying again."],
  };
  const [status, message] = messages[error.code ?? ""] ?? [503, "Your private library connection is unavailable. Please try again."];
  throw new ManuscriptError(error.code ?? "unavailable", status, message);
}
function recordingKey() {
  const key = process.env.KIRA_AI_RECORDING_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key)) throw new ManuscriptError("unconfigured", 503, "The private manuscript connection needs the workspace owner’s setup.");
  return key;
}
function singleComposite(value: unknown) { return Array.isArray(value) && value.length === 1 ? value[0] : value; }
export function manuscriptSummary(row: StoredManuscript) {
  return { id: row.id, version: row.version, filename: row.filename, size_bytes: row.size_bytes, status: row.status,
    chunk_count: row.chunk_count, completed_chunks: row.completed_chunks, created_at: row.created_at, error_code: row.error_code };
}
/** Every query uses a verified caller client and explicit author scope, in addition to RLS. */
export function createManuscriptRepository(supabase: SupabaseClient, authorId: string) {
  z.uuid().parse(authorId);
  async function rpc(name: string, args: Record<string, unknown>, protectedWrite = true) {
    const { data, error } = await supabase.rpc(name, { p_author_id: authorId, ...args, ...(protectedWrite ? { p_recording_key: recordingKey() } : {}) });
    checkLibraryError(error); return data as unknown;
  }
  async function attachSources(rows: Record<string, unknown>[]) {
    const ids = [...new Set(rows.map((row) => String(row.source_id)))];
    if (!ids.length) return [];
    const { data, error } = await supabase.from("sources").select("id,url").eq("author_id", authorId).in("id", ids);
    checkLibraryError(error);
    const sources = new Map((data ?? []).map((source) => [source.id, source.url]));
    return rows.map((row) => libraryBookSchema.parse({ ...row, source_url: sources.get(row.source_id) ?? null }));
  }
  async function findBook(idOrSlug: string, bySlug = false) {
    const { data, error } = await supabase.from("books").select(bookColumns).eq("author_id", authorId)
      .eq(bySlug ? "slug" : "id", idOrSlug).neq("data_origin", "demo").maybeSingle();
    checkLibraryError(error);
    if (!data) throw new ManuscriptError("not_found", 404, "This book is unavailable in your workspace.");
    return (await attachSources([data]))[0];
  }
  async function listSeries() {
    const { data, error } = await supabase.from("series").select("id,name").eq("author_id", authorId).neq("data_origin", "demo").order("name");
    checkLibraryError(error); return librarySeriesSchema.array().parse(data ?? []);
  }
  async function findManuscript(id: string) {
    const { data, error } = await supabase.from("manuscripts").select("*").eq("author_id", authorId).eq("id", z.uuid().parse(id)).maybeSingle();
    checkLibraryError(error);
    if (!data) throw new ManuscriptError("not_found", 404, "This manuscript is unavailable in your workspace.");
    return storedManuscriptSchema.parse(data);
  }
  return {
    findBook, findManuscript,
    async list() {
      const [books, series] = await Promise.all([
        supabase.from("books").select(bookColumns).eq("author_id", authorId).neq("data_origin", "demo").order("created_at"), listSeries(),
      ]);
      checkLibraryError(books.error);
      return { books: await attachSources(books.data ?? []), series };
    },
    async detail(id: string, bySlug = false) {
      const book = await findBook(id, bySlug);
      const [series, versions, knowledge] = await Promise.all([
        listSeries(),
        supabase.from("manuscripts").select("*").eq("author_id", authorId).eq("book_id", book.id).order("version", { ascending: false }),
        book.active_manuscript_id ? supabase.from("book_intelligence").select("manuscript_id,profile,extracted_at,model").eq("author_id", authorId).eq("manuscript_id", book.active_manuscript_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      checkLibraryError(versions.error); checkLibraryError(knowledge.error);
      return { book, series, manuscripts: storedManuscriptSchema.array().parse(versions.data ?? []).map(manuscriptSummary),
        intelligence: knowledge.data ? { manuscript_id: knowledge.data.manuscript_id, ...knowledge.data.profile,
          created_at: knowledge.data.extracted_at, model: knowledge.data.model } : null };
    },
    async saveBook(input: LibraryInput, bookId: string | null = null) {
      const row = await rpc("library_save_book", {
        p_book_id: bookId, p_title: input.title, p_series_id: input.seriesId, p_series_name: input.seriesName ?? null,
        p_series_order: input.seriesOrder, p_overview: input.overview, p_metadata: input.metadata,
        p_expected_updated_at: input.expectedUpdatedAt ?? null,
      }, false);
      return (await attachSources([z.record(z.string(), z.unknown()).parse(singleComposite(row))]))[0];
    },
    async register(input: { id: string; bookId: string; filename: string; mime: string; bytes: number; hash: string }) {
      return storedManuscriptSchema.parse(singleComposite(await rpc("manuscript_register", {
        p_id: input.id, p_book_id: input.bookId, p_filename: input.filename, p_mime_type: input.mime,
        p_size_bytes: input.bytes, p_content_hash: input.hash,
      })));
    },
    async storeChunks(id: string, chunks: z.infer<typeof storedChunkSchema>[]) {
      return rpc("manuscript_store_chunks", { p_id: id, p_chunks: chunks });
    },
    async failUpload(id: string) { return rpc("manuscript_fail_upload", { p_id: id, p_error_code: "storage_error" }); },
    async beginBatch(id: string, requestId: string, retry: boolean) {
      return z.object({ created: z.boolean(), batch: z.record(z.string(), z.unknown()).nullable(), chunks: storedChunkSchema.array() }).parse(
        await rpc("manuscript_begin_batch", { p_id: id, p_request_id: requestId, p_retry: retry }));
    },
    async finishBatch(id: string, requestId: string, result: unknown | null, usage: unknown, embeddings: unknown[], errorCode: string | null) {
      return rpc("manuscript_finish_batch", { p_id: id, p_request_id: requestId, p_result: result, p_error_code: errorCode, p_usage: usage, p_embeddings: embeddings });
    },
    async source(manuscriptId: string, chunkId: string) {
      await findManuscript(manuscriptId);
      const { data, error } = await supabase.from("knowledge_chunks").select("id,manuscript_id,section,reference_text").eq("author_id", authorId).eq("manuscript_id", manuscriptId).eq("id", chunkId).maybeSingle();
      checkLibraryError(error);
      if (!data) throw new ManuscriptError("not_found", 404, "This source passage is unavailable in your workspace.");
      return { chunk: { id: data.id, manuscript_id: data.manuscript_id, location: data.section, text: data.reference_text } };
    },
    async search(query: string, bookId: string | null, embedding: number[] | null = null) {
      return { results: await rpc("manuscript_search", { p_query: query, p_embedding: embedding ? JSON.stringify(embedding) : null, p_book_id: bookId, p_limit: 8 }, false), mode: embedding ? "hybrid" as const : "lexical" as const };
    },
  };
}
