export const PORTRAIT_MAX_BYTES = 8 * 1024 * 1024;
export const PORTRAIT_MIME_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
export type PortraitFormat = keyof typeof PORTRAIT_MIME_TYPES;
export const PORTRAIT_USAGE_PERMISSIONS = ["private_reference_only", "promotional_approved"] as const;
export type PortraitUsagePermission = (typeof PORTRAIT_USAGE_PERMISSIONS)[number];

const extensions: Record<string, PortraitFormat> = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp" };

/** A declared type is only accepted when the filename agrees; the bytes are checked separately. */
export function portraitFormat(filename: string, declaredType: string): PortraitFormat | null {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  const byName = extensions[extension] ?? null;
  const byType = (Object.entries(PORTRAIT_MIME_TYPES).find(([, mime]) => mime === declaredType)?.[0] ?? null) as PortraitFormat | null;
  if (!byName || !byType || byName !== byType) return null;
  return byName;
}

import { z } from "zod";
import { artworkSchema } from "@/lib/workspace-resume";

export const PORTRAIT_URL_TTL_SECONDS = 300;
const name = z.string().trim().min(1).max(120);
const aliases = z.array(name).max(8).refine(values => new Set(values.map(value => value.replace(/\s+/g, " ").toLocaleLowerCase())).size === values.length, "Each other name must be different.");
export const characterProfileInputSchema = z.object({
  displayName: name,
  summary: z.string().trim().max(2000).nullish().transform(value => value?.length ? value : null),
  aliases: aliases.default([]),
});
export const characterProfileEditSchema = characterProfileInputSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
  primaryPortraitId: z.uuid().nullish(),
  homeShowcasePinned: z.boolean().optional(),
});
export const HOME_SHOWCASE_MAX = 6;
export type CharacterProfileInput = z.infer<typeof characterProfileInputSchema>;

export const galleryPortraitSchema = z.object({
  id: z.uuid(), caption: z.string().nullable(), source_credit: z.string().nullable(),
  usage_permission: z.enum(PORTRAIT_USAGE_PERMISSIONS), width: z.number().nullable(), height: z.number().nullable(),
  created_at: z.string(), url: z.string().nullable(),
});
export const galleryProfileSchema = z.object({
  id: z.uuid(), display_name: z.string(), summary: z.string().nullable(), universe_id: z.uuid().nullable(),
  primary_portrait_id: z.uuid().nullable(), version: z.number(), updated_at: z.string(),
  aliases: z.array(z.string()), portrait_count: z.number(), book_count: z.number(),
  cover: galleryPortraitSchema.nullable(), home_showcase_pinned_at: z.string().nullable(),
});
export const characterGallerySchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
  profiles: z.array(galleryProfileSchema),
  publishedArtwork: artworkSchema.array().max(6).default([]),
});
export const characterNoteSchema = z.object({
  id: z.uuid(), kind: z.enum(["author_confirmed", "visual_inspiration"]), body: z.string(),
  book_id: z.uuid().nullable(), version: z.number(), created_at: z.string(),
});
export const characterLinkSchema = z.object({
  id: z.uuid(), book_id: z.uuid(), character_id: z.uuid(), note: z.string().nullable(),
  source_manuscript_id: z.uuid().nullable().optional(), source_chunk_ids: z.array(z.uuid()).default([]),
  confirmed_at: z.string(), book_title: z.string().nullable(), character_name: z.string().nullable(), book_slug: z.string().nullable().optional(),
});
export const characterRelationshipSchema = z.object({
  id: z.uuid(), profile_id: z.uuid(), related_profile_id: z.uuid(),
  label: z.string(), note: z.string().nullable(), book_id: z.uuid().nullable(),
  version: z.number(), updated_at: z.string(),
  profile_name: z.string(), related_profile_name: z.string(), book_title: z.string().nullable(),
});
export type CharacterRelationship = z.infer<typeof characterRelationshipSchema>;
export const characterProfileDetailSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
  profile: galleryProfileSchema,
  portraits: z.array(galleryPortraitSchema),
  notes: z.array(characterNoteSchema),
  links: z.array(characterLinkSchema),
  relationships: z.array(characterRelationshipSchema),
});
export type CharacterGallery = z.infer<typeof characterGallerySchema>;
export type GalleryProfile = z.infer<typeof galleryProfileSchema>;
export type GalleryPortrait = z.infer<typeof galleryPortraitSchema>;
export type CharacterProfileDetail = z.infer<typeof characterProfileDetailSchema>;

export const characterNoteInputSchema = z.object({
  kind: z.enum(["author_confirmed", "visual_inspiration"]),
  body: z.string().trim().min(1).max(4000),
  bookId: z.uuid().nullable().default(null),
});
export const characterNoteEditSchema = characterNoteInputSchema.omit({ bookId: true }).extend({ expectedVersion: z.number().int().positive() });
export const characterLinkInputSchema = z.object({
  bookId: z.uuid(), characterId: z.uuid(), manuscriptId: z.uuid(), confirmed: z.literal(true),
  note: z.string().trim().max(600).nullish().transform(value => value || null),
});
export const characterSourceSchema = z.object({
  character_id: z.uuid(), book_id: z.uuid(), book_title: z.string(), book_slug: z.string(),
  name: z.string(), manuscript_id: z.uuid(), observation_count: z.number(),
  linked_profile_id: z.uuid().nullable(), source_chunk_ids: z.array(z.uuid()).default([]), source_sections: z.array(z.string()),
});
export const characterSourcesSchema = z.object({ sources: z.array(characterSourceSchema) });
export type CharacterSource = z.infer<typeof characterSourceSchema>;

export const CHARACTER_RELATIONSHIP_LABEL_MAX = 120;
const characterRelationshipFields = z.object({
  profileId: z.uuid(),
  relatedProfileId: z.uuid(),
  label: z.string().trim().min(1).max(CHARACTER_RELATIONSHIP_LABEL_MAX),
  note: z.string().trim().max(600).nullish().transform(value => value?.length ? value : null),
  bookId: z.uuid().nullish(),
});
/** Read as a sentence: "<the profile> <label> <the related profile>". No inverse is generated. */
export const characterRelationshipInputSchema = characterRelationshipFields
  .refine(value => value.profileId !== value.relatedProfileId, { message: "A character cannot have a relationship with themselves.", path: ["relatedProfileId"] });
export const characterRelationshipEditSchema = characterRelationshipFields.omit({ profileId: true, relatedProfileId: true }).partial().extend({
  expectedVersion: z.number().int().positive(),
});
export type CharacterRelationshipInput = z.infer<typeof characterRelationshipInputSchema>;
export const characterRelationshipsSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
  relationships: z.array(characterRelationshipSchema),
});
