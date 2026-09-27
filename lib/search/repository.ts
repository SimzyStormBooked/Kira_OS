import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createStudioRepository, StudioRepositoryError } from "@/lib/db/studio-repository";
import { workspaceSearchQuerySchema, type WorkspaceSearchResult } from "./contract";

const profileSchema = z.object({ id: z.uuid(), display_name: z.string(), summary: z.string().nullable() });
/** Query text is a bound value, with literal LIKE metacharacters, never PostgREST filter syntax. */
export function literalSearchPattern(query: string) { return `%${query.replace(/[\\%_]/g, "\\$&")}%`; }
export async function searchWorkspace(supabase: SupabaseClient, authorId: string, input: string): Promise<WorkspaceSearchResult[]> {
  const query = workspaceSearchQuerySchema.parse(input);
  const pattern = literalSearchPattern(query);
  const profiles = (column: "display_name" | "summary") => supabase.from("character_profiles")
    .select("id,display_name,summary").eq("author_id", authorId).ilike(column, pattern)
    .order("display_name", { ascending: true }).order("id", { ascending: true }).limit(6);
  const [names, summaries, history] = await Promise.all([
    profiles("display_name"), profiles("summary"),
    createStudioRepository(supabase, authorId).list({ query, limit: 6, completedOnly: true }),
  ]);
  if (names.error || summaries.error) throw new StudioRepositoryError(names.error?.code ?? summaries.error?.code ?? "unavailable");
  const unique = new Map(profileSchema.array().parse([...(names.data ?? []), ...(summaries.data ?? [])]).map(profile => [profile.id, profile]));
  return [
    ...[...unique.values()].slice(0, 6).map(profile => ({ id: profile.id, kind: "character" as const, title: profile.display_name, excerpt: (profile.summary ?? "Author’s character profile").slice(0, 180) })),
    ...history.generations.map(item => ({ id: item.id, kind: "raven-answer" as const, title: item.result!.title, excerpt: item.result!.summary.slice(0, 180) })),
  ];
}
