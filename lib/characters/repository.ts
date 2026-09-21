import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ManuscriptError } from "@/lib/manuscripts/http";
import { checkLibraryError } from "@/lib/manuscripts/repository";
import { PORTRAIT_URL_TTL_SECONDS, PORTRAIT_USAGE_PERMISSIONS, type CharacterProfileInput } from "./contract";

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
  /** Portraits are private: a member receives a short-lived signed URL, never a path. */
  async function signedUrls(rows: { id: string; storage_path: string }[]) {
    if (!rows.length) return new Map<string, string>();
    const { data } = await supabase.storage.from("kira-character-portraits")
      .createSignedUrls(rows.map(row => row.storage_path), PORTRAIT_URL_TTL_SECONDS);
    const byPath = new Map((data ?? []).map(entry => [entry.path ?? "", entry.signedUrl]));
    return new Map(rows.flatMap(row => {
      const url = byPath.get(row.storage_path);
      return url ? [[row.id, url] as [string, string]] : [];
    }));
  }
  async function readyPortraits(profileIds: string[] | null) {
    let query = supabase.from("character_portraits").select("*").eq("author_id", authorId).eq("status", "ready");
    if (profileIds) query = query.in("profile_id", profileIds);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
    checkLibraryError(error);
    return (data ?? []).map(row => storedPortraitSchema.parse(row));
  }
  async function present(rows: StoredPortrait[]) {
    const urls = await signedUrls(rows);
    return rows.map(row => ({
      id: row.id, caption: row.caption, source_credit: row.source_credit, usage_permission: row.usage_permission,
      width: row.width, height: row.height, created_at: row.created_at, url: urls.get(row.id) ?? null,
    }));
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
    async listProfiles() {
      const { data, error } = await supabase.from("character_profiles")
        .select("id,display_name,normalized_name,universe_id,summary,primary_portrait_id,version,updated_at")
        .eq("author_id", authorId).order("normalized_name").limit(500);
      checkLibraryError(error);
      const profiles = (data ?? []).map(row => characterProfileSchema.parse(row));
      if (!profiles.length) return [];
      const ids = profiles.map(profile => profile.id);
      const [aliases, portraits, links] = await Promise.all([
        supabase.from("character_profile_aliases").select("profile_id,alias").eq("author_id", authorId).in("profile_id", ids),
        readyPortraits(ids),
        supabase.from("character_profile_links").select("profile_id,book_id").eq("author_id", authorId).in("profile_id", ids),
      ]);
      checkLibraryError(aliases.error); checkLibraryError(links.error);
      // Only a cover needs a signed URL on the gallery; the rest are signed on the profile.
      const covers = profiles.flatMap(profile => {
        const owned = portraits.filter(portrait => portrait.profile_id === profile.id);
        const cover = owned.find(portrait => portrait.id === profile.primary_portrait_id) ?? owned[0];
        return cover ? [cover] : [];
      });
      const presented = new Map((await present(covers)).map(portrait => [portrait.id, portrait]));
      return profiles.map(profile => {
        const owned = portraits.filter(portrait => portrait.profile_id === profile.id);
        const cover = owned.find(portrait => portrait.id === profile.primary_portrait_id) ?? owned[0];
        return {
          ...profile,
          aliases: (aliases.data ?? []).filter(row => row.profile_id === profile.id).map(row => String(row.alias)),
          portrait_count: owned.length,
          book_count: new Set((links.data ?? []).filter(row => row.profile_id === profile.id).map(row => String(row.book_id))).size,
          cover: cover ? presented.get(cover.id) ?? null : null,
        };
      });
    },
    async profileDetail(profileId: string) {
      const profile = await this.findProfile(profileId);
      const [aliases, portraits, notes, links] = await Promise.all([
        supabase.from("character_profile_aliases").select("alias").eq("author_id", authorId).eq("profile_id", profileId).order("normalized_alias"),
        readyPortraits([profileId]),
        supabase.from("character_notes").select("id,kind,body,book_id,version,created_at").eq("author_id", authorId).eq("profile_id", profileId).order("created_at", { ascending: false }).limit(200),
        supabase.from("character_profile_links").select("id,book_id,character_id,note,confirmed_at").eq("author_id", authorId).eq("profile_id", profileId),
      ]);
      for (const result of [aliases, notes, links]) checkLibraryError(result.error);
      const linkRows = links.data ?? [];
      // Composite tenant keys are not embeddable, so titles and names are fetched by ID.
      const [books, characters] = await Promise.all([
        linkRows.length ? supabase.from("books").select("id,title").eq("author_id", authorId).in("id", linkRows.map(row => String(row.book_id))) : Promise.resolve({ data: [], error: null }),
        linkRows.length ? supabase.from("characters").select("id,name").eq("author_id", authorId).in("id", linkRows.map(row => String(row.character_id))) : Promise.resolve({ data: [], error: null }),
      ]);
      checkLibraryError(books.error); checkLibraryError(characters.error);
      const titles = new Map((books.data ?? []).map(row => [String(row.id), String(row.title)]));
      const names = new Map((characters.data ?? []).map(row => [String(row.id), String(row.name)]));
      const presented = await present(portraits);
      const aliasList = (aliases.data ?? []).map(row => String(row.alias));
      return {
        profile: {
          ...profile, aliases: aliasList, portrait_count: portraits.length,
          book_count: new Set(linkRows.map(row => String(row.book_id))).size,
          cover: presented.find(portrait => portrait.id === profile.primary_portrait_id) ?? presented[0] ?? null,
        },
        portraits: presented,
        notes: notes.data ?? [],
        links: linkRows.map(row => ({ ...row, book_title: titles.get(String(row.book_id)) ?? null, character_name: names.get(String(row.character_id)) ?? null })),
      };
    },
    async createProfile(input: CharacterProfileInput) {
      const { data, error } = await supabase.from("character_profiles")
        .insert({ author_id: authorId, display_name: input.displayName, summary: input.summary })
        .select("id,display_name,normalized_name,universe_id,summary,primary_portrait_id,version,updated_at").single();
      checkLibraryError(error);
      const profile = characterProfileSchema.parse(data);
      if (input.aliases.length) {
        const { error: aliasError } = await supabase.from("character_profile_aliases")
          .insert(input.aliases.map(alias => ({ author_id: authorId, profile_id: profile.id, alias })));
        checkLibraryError(aliasError);
      }
      return profile;
    },
    /** The stored version must still match, so a stale edit fails instead of overwriting. */
    async updateProfile(profileId: string, changes: { displayName?: string; summary?: string | null; primaryPortraitId?: string | null }, expectedVersion: number) {
      const patch: Record<string, unknown> = {};
      if (changes.displayName !== undefined) patch.display_name = changes.displayName;
      if (changes.summary !== undefined) patch.summary = changes.summary;
      if (changes.primaryPortraitId !== undefined) patch.primary_portrait_id = changes.primaryPortraitId;
      if (!Object.keys(patch).length) return this.findProfile(profileId);
      const { data, error } = await supabase.from("character_profiles").update(patch)
        .eq("author_id", authorId).eq("id", profileId).eq("version", expectedVersion)
        .select("id,display_name,normalized_name,universe_id,summary,primary_portrait_id,version,updated_at").maybeSingle();
      checkLibraryError(error);
      if (!data) throw new ManuscriptError("40001", 409, "This character changed since you opened it. Reload before saving again.");
      return characterProfileSchema.parse(data);
    },
  };
}
