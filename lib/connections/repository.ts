import type { SupabaseClient } from "@supabase/supabase-js";
import { connectionInputSchema, connectionLinkSchema, type ConnectionInput } from "./schema";

export class ConnectionRepositoryError extends Error {
  constructor(public readonly code: string) { super("Could not update saved links."); }
}
export function createConnectionRepository(supabase: SupabaseClient, authorId: string) {
  async function load() {
    const { data, error } = await supabase.from("workspace_links")
      .select("id,author_id,platform,label,url,created_by,created_at,data_origin")
      .eq("author_id", authorId).order("created_at", { ascending: false });
    if (error) throw new ConnectionRepositoryError(error.code);
    return connectionLinkSchema.array().parse(data ?? []);
  }
  return {
    load,
    async add(input: ConnectionInput) {
      const value = connectionInputSchema.parse(input);
      const { error } = await supabase.from("workspace_links").insert({ author_id: authorId, ...value });
      if (error) throw new ConnectionRepositoryError(error.code);
      return load();
    },
    async remove(id: string) {
      const { data, error } = await supabase.from("workspace_links").delete().eq("author_id", authorId).eq("id", id).select("id").maybeSingle();
      if (error) throw new ConnectionRepositoryError(error.code);
      if (!data) throw new ConnectionRepositoryError("P0002");
      return load();
    },
  };
}
