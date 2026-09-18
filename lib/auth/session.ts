import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceConfig, type WorkspaceMode } from "@/lib/config";
import { createWorkspaceSupabaseClient } from "./client";
import { WorkspaceAccessError } from "./errors";
export { WorkspaceAccessError } from "./errors";

export type WorkspaceAuthorization = "demo" | "unconfigured" | "anonymous" | "authorized" | "forbidden" | "unavailable";
export interface WorkspaceSession {
  mode: WorkspaceMode;
  configured: boolean;
  user: { id: string; email: string | null } | null;
  authorId: string | null;
  authorization: WorkspaceAuthorization;
}

/** Verify identity against Auth, then require the configured author row to be visible under RLS. */
export async function verifyWorkspaceAccess(
  supabase: SupabaseClient,
  authorId: string,
): Promise<WorkspaceSession> {
  const session: WorkspaceSession = {
    mode: "connected", configured: true, user: null, authorId: null, authorization: "anonymous",
  };
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || user.is_anonymous) {
      if (error && (!error.status || error.status >= 500)) session.authorization = "unavailable";
      return session;
    }
    session.user = { id: user.id, email: user.email ?? null };
    const { data: author, error: authorError } = await supabase
      .from("authors").select("id").eq("id", authorId).maybeSingle();
    if (authorError) return { ...session, authorization: "unavailable" };
    if (!author || author.id !== authorId) return { ...session, authorization: "forbidden" };
    return { ...session, authorId, authorization: "authorized" };
  } catch {
    return { ...session, authorization: "unavailable" };
  }
}

const loadWorkspaceAccess = cache(async (): Promise<{
  session: WorkspaceSession; supabase: SupabaseClient | null;
}> => {
  const config = getWorkspaceConfig();
  const session: WorkspaceSession = {
    mode: config.mode, configured: config.configured, user: null, authorId: null,
    authorization: config.mode === "demo" ? "demo" : "unconfigured",
  };
  if (config.mode === "demo" || !config.configured || !config.authorId) {
    return { session, supabase: null };
  }
  const supabase = await createWorkspaceSupabaseClient();
  return { session: await verifyWorkspaceAccess(supabase, config.authorId), supabase };
});

export async function getWorkspaceSession(): Promise<WorkspaceSession> {
  return (await loadWorkspaceAccess()).session;
}

export async function requireWorkspaceSession(): Promise<{
  mode: "connected"; configured: true; authorization: "authorized";
  user: { id: string; email: string | null }; authorId: string; supabase: SupabaseClient;
}> {
  const { session, supabase } = await loadWorkspaceAccess();
  if (session.authorization === "authorized" && session.user && session.authorId && supabase) {
    return { mode: "connected", configured: true, authorization: "authorized", user: session.user, authorId: session.authorId, supabase };
  }
  if (session.authorization === "anonymous") {
    throw new WorkspaceAccessError(401, "unauthenticated", "Sign in to your private workspace.");
  }
  if (session.authorization === "forbidden") {
    throw new WorkspaceAccessError(403, "forbidden", "This account does not have access to this workspace.");
  }
  if (session.authorization === "unavailable") {
    throw new WorkspaceAccessError(503, "unavailable", "We could not verify workspace access. Please try again.");
  }
  throw new WorkspaceAccessError(503, "unconfigured", "The private workspace connection is not ready yet.");
}
