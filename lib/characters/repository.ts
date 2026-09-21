import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ManuscriptError } from "@/lib/manuscripts/http";
import { checkLibraryError } from "@/lib/manuscripts/repository";
import { PORTRAIT_USAGE_PERMISSIONS } from "./contract";

export const storedPortraitSchema = z.object({
  id: z.uuid(), author_id: z.uuid(), profile_id: z.uuid(), storage_path: z.string(),
  status: z.enum(["uploading", "ready", "failed"]), mime_type: z.string(), size_bytes: z.number(),
  content_hash: z.string(), width: z.number().nullable(), height: z.number().nullable(),
  caption: z.string().nullable(), source_credit: z.string().nullable(),
  usage_permission: z.enum(PORTRAIT_USAGE_PERMISSIONS), location_metadata_removed: z.boolean(),
  sanitized_at: z.string().nullable(), error_code: z.string().nullable(), created_at: z.string(),
});
export type StoredPortrait = z.infer<typeof storedPortraitSchema>;
export const characterProfileSchema = z.object({
  id: z.uuid(), display_name: z.string(), normalized_name: z.string(), universe_id: z.uuid().nullable(),
  summary: z.string().nullable(), primary_portrait_id: z.uuid().nullable(), version: z.number(), updated_at: z.string(),
});

/** A portrait's stored path is private; members receive a signed URL instead. */
export function portraitSummary(row: StoredPortrait) {
  return { id: row.id, profile_id: row.profile_id, status: row.status, mime_type: row.mime_type,
    size_bytes: row.size_bytes, width: row.width, height: row.height, caption: row.caption,
    source_credit: row.source_credit, usage_permission: row.usage_permission,
    location_metadata_removed: row.location_metadata_removed, created_at: row.created_at, error_code: row.error_code };
}
function recordingKey() {
  const key = process.env.KIRA_AI_RECORDING_KEY;
  if (!key || /^[a-f\d]{64}$/i.test(key) === false) throw new ManuscriptError("unconfigured", 503, "Private portrait storage needs the workspace owner’s setup.");
  return key;
}
function singleComposite(value: unknown) { return Array.isArray(value) && value.length === 1 ? value[0] : value; }

/** Every query uses the verified caller's client and explicit author scope, in addition to RLS. */
export function createCharacterRepository(supabase: SupabaseClient, authorId: string) {
  z.uuid().parse(authorId);
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await supabase.rpc(name, { p_author_id: authorId, ...args, p_recording_key: recordingKey() });
    checkLibraryError(error);
    return storedPortraitSchema.parse(singleComposite(data));
  }
  return {
    async findProfile(profileId: string) {
      const { data, error } = await supabase.from("character_profiles")
        .select("id,display_name,normalized_name,universe_id,summary,primary_portrait_id,version,updated_at")
        .eq("author_id", authorId).eq("id", profileId).maybeSingle();
      checkLibraryError(error);
      if (!data) throw new ManuscriptError("P0002", 404, "This character is unavailable in your workspace.");
      return characterProfileSchema.parse(data);
    },
    async findPortrait(id: string) {
      const { data, error } = await supabase.from("character_portraits").select("*").eq("author_id", authorId).eq("id", id).maybeSingle();
      checkLibraryError(error);
      if (!data) throw new ManuscriptError("P0002", 404, "This portrait is unavailable in your workspace.");
      return storedPortraitSchema.parse(data);
    },
    async register(input: { id: string; profileId: string; mime: string; bytes: number; hash: string; caption: string | null; sourceCredit: string | null; usagePermission: string }) {
      return rpc("character_portrait_register", {
        p_id: input.id, p_profile_id: input.profileId, p_mime_type: input.mime, p_size_bytes: input.bytes,
        p_content_hash: input.hash, p_caption: input.caption, p_source_credit: input.sourceCredit, p_usage_permission: input.usagePermission,
      });
    },
    /** Only reached after the sanitized bytes are confirmed stored. */
    async finish(id: string, width: number | null, height: number | null) {
      return rpc("character_portrait_finish", { p_id: id, p_location_metadata_removed: true, p_width: width, p_height: height });
    },
    async fail(id: string, code: "storage_error" | "sanitize_error" | "unsupported_image") {
      return rpc("character_portrait_fail", { p_id: id, p_error_code: code });
    },
  };
}
