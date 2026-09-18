import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { WorkspaceAccessError } from "./errors";

export type WorkspaceRole = "owner" | "editor" | "viewer";
export interface RoleSession {
  supabase: SupabaseClient;
  authorId: string;
  user: { id: string };
}
const memberSchema = z.object({
  id: z.uuid(), userId: z.uuid(), email: z.string().nullable(),
  role: z.enum(["editor", "viewer"]), version: z.number().int().nonnegative(),
  createdAt: z.string(), updatedAt: z.string(),
});
const ownerListSchema = z.object({
  owner: z.object({ userId: z.uuid(), email: z.string().nullable() }),
  members: z.array(memberSchema),
});
export type WorkspaceMember = z.infer<typeof memberSchema>;
export interface WorkspaceAccessDetails {
  role: WorkspaceRole;
  owner: z.infer<typeof ownerListSchema>["owner"] | null;
  members: WorkspaceMember[];
}
export class WorkspaceAccessOperationError extends Error {
  constructor(public readonly code: string) {
    super("Workspace access operation failed.");
    this.name = "WorkspaceAccessOperationError";
  }
}

/** Call with a verified session. RLS and fresh database rows determine the role. */
export async function getWorkspaceRole({ supabase, authorId, user }: RoleSession): Promise<WorkspaceRole> {
  const { data: author, error } = await supabase.from("authors")
    .select("id,owner_user_id").eq("id", authorId).maybeSingle();
  if (error) throw new WorkspaceAccessError(503, "unavailable", "Could not verify your workspace role.");
  if (!author || author.id !== authorId) throw new WorkspaceAccessError(403, "forbidden", "This account does not have access to this workspace.");
  if (author.owner_user_id === user.id) return "owner";
  const { data: member, error: memberError } = await supabase.from("author_members")
    .select("role").eq("author_id", authorId).eq("user_id", user.id).maybeSingle();
  if (memberError) throw new WorkspaceAccessError(503, "unavailable", "Could not verify your workspace role.");
  if (member?.role === "editor" || member?.role === "viewer") return member.role;
  throw new WorkspaceAccessError(403, "forbidden", "This account does not have access to this workspace.");
}

export async function readWorkspaceAccess(session: RoleSession): Promise<WorkspaceAccessDetails> {
  const role = await getWorkspaceRole(session);
  if (role !== "owner") return { role, owner: null, members: [] };
  const { data, error } = await session.supabase.rpc("workspace_access_list", { p_author_id: session.authorId });
  if (error) throw new WorkspaceAccessOperationError(error.code ?? "unavailable");
  const parsed = ownerListSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceAccessOperationError("unavailable");
  return { role, ...parsed.data };
}
