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

export const PORTRAIT_URL_TTL_SECONDS = 300;
const name = z.string().trim().min(1).max(120);
export const characterProfileInputSchema = z.object({
  displayName: name,
  summary: z.string().trim().max(2000).nullish().transform(value => value?.length ? value : null),
  aliases: z.array(name).max(8).default([]),
});
export const characterProfileEditSchema = characterProfileInputSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
  primaryPortraitId: z.uuid().nullish(),
});
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
  cover: galleryPortraitSchema.nullable(),
});
export const characterGallerySchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
  profiles: z.array(galleryProfileSchema),
});
export const characterNoteSchema = z.object({
  id: z.uuid(), kind: z.enum(["author_confirmed", "visual_inspiration"]), body: z.string(),
  book_id: z.uuid().nullable(), version: z.number(), created_at: z.string(),
});
export const characterLinkSchema = z.object({
  id: z.uuid(), book_id: z.uuid(), character_id: z.uuid(), note: z.string().nullable(),
  confirmed_at: z.string(), book_title: z.string().nullable(), character_name: z.string().nullable(),
});
export const characterProfileDetailSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
  profile: galleryProfileSchema,
  portraits: z.array(galleryPortraitSchema),
  notes: z.array(characterNoteSchema),
  links: z.array(characterLinkSchema),
});
export type CharacterGallery = z.infer<typeof characterGallerySchema>;
export type GalleryProfile = z.infer<typeof galleryProfileSchema>;
export type GalleryPortrait = z.infer<typeof galleryPortraitSchema>;
export type CharacterProfileDetail = z.infer<typeof characterProfileDetailSchema>;
