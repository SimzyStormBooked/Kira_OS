import { z } from "zod";
import { manuscriptExtractionSchema } from "./contract";

export const libraryRoleSchema = z.enum(["owner", "editor", "viewer"]);
export const libraryMetadataSchema = z.object({
  genre: z.string().max(200).optional(),
  audiobook_available: z.boolean().optional(),
  narrator: z.string().max(200).optional(),
  runtime_minutes: z.number().positive().max(100000).optional(),
  audio_notes: z.string().max(4000).optional(),
}).strict();
export const libraryBookSchema = z.object({
  id: z.uuid(), slug: z.string(), title: z.string(),
  series_id: z.uuid().nullable(), series_order: z.number().nullable(),
  overview: z.string().nullable(), metadata: libraryMetadataSchema.default({}),
  source_url: z.string().nullable(), verified_at: z.string().nullable(),
  data_origin: z.enum(["public_verified", "manual"]), verification_status: z.string(),
  active_manuscript_id: z.uuid().nullable(), updated_at: z.string(),
});
export const librarySeriesSchema = z.object({ id: z.uuid(), name: z.string() });
export const librarySchema = z.object({ books: z.array(libraryBookSchema), series: z.array(librarySeriesSchema), role: libraryRoleSchema });
export const libraryResponseSchema = librarySchema;
export const libraryInputSchema = z.object({
  title: z.string().trim().min(1).max(250),
  seriesId: z.uuid().nullable().default(null), seriesName: z.string().trim().min(1).max(200).optional(),
  seriesOrder: z.number().int().positive().max(10000).nullable().default(null),
  overview: z.string().trim().max(10000).nullable().default(null),
  metadata: libraryMetadataSchema.default({}), expectedUpdatedAt: z.string().optional(),
}).strict().refine(value => !(value.seriesId && value.seriesName), { message: "Choose an existing series or create a new one." });
export const manuscriptSummarySchema = z.object({
  id: z.uuid(), version: z.number().int(), filename: z.string(),
  size_bytes: z.number().int().nonnegative(),
  status: z.enum(["uploading", "queued", "processing", "ready", "failed"]),
  chunk_count: z.number().int().nonnegative(), completed_chunks: z.number().int().nonnegative(),
  created_at: z.string(), error_code: z.string().nullable(),
});
/** A short-lived, caller-scoped link so an author can take her own file back out. */
export const manuscriptFileSchema = z.object({ url: z.string(), filename: z.string(), expires_in_seconds: z.number().int().positive() });
export const manuscriptSourceSchema = z.object({ chunk: z.object({ id: z.uuid(), manuscript_id: z.uuid(), location: z.string(), text: z.string() }) });
export const sourceResponseSchema = manuscriptSourceSchema;
export const librarySearchSchema = z.object({
  results: z.array(z.object({ book_id: z.uuid(), book_title: z.string(), manuscript_id: z.uuid(), chunk_id: z.uuid(), location: z.string(), excerpt: z.string(), score: z.number().optional() })),
  mode: z.enum(["lexical", "hybrid"]),
});
export const searchResponseSchema = librarySearchSchema;
export const bookDetailSchema = z.object({
  book: libraryBookSchema, series: z.array(librarySeriesSchema), role: libraryRoleSchema,
  manuscripts: z.array(manuscriptSummarySchema),
  intelligence: manuscriptExtractionSchema.extend({ facts: manuscriptExtractionSchema.shape.facts.element.array().max(8000), characters: manuscriptExtractionSchema.shape.characters.element.array().max(4000), manuscript_id: z.uuid(), created_at: z.string(), model: z.string() }).nullable(),
});
export type LibraryBook = z.infer<typeof libraryBookSchema>;
export type LibraryMetadata = z.infer<typeof libraryMetadataSchema>;
export type LibrarySeries = z.infer<typeof librarySeriesSchema>;
export type LibraryResponse = z.infer<typeof librarySchema>;
export type LibraryInput = z.infer<typeof libraryInputSchema>;
export type BookDetailResponse = z.infer<typeof bookDetailSchema>;
export type ManuscriptSummary = z.infer<typeof manuscriptSummarySchema>;
export type ManuscriptFileLink = z.infer<typeof manuscriptFileSchema>;
export type LibrarySearchResult = z.infer<typeof librarySearchSchema>["results"][number];
