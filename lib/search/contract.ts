import { z } from "zod";

export const workspaceSearchQuerySchema = z.string().trim().min(2).max(200);
export const workspaceSearchResultSchema = z.object({
  id: z.uuid(), kind: z.enum(["character", "raven-answer"]), title: z.string(), excerpt: z.string(),
});
export const workspaceSearchResponseSchema = z.object({ results: workspaceSearchResultSchema.array().max(12) });
export type WorkspaceSearchResult = z.infer<typeof workspaceSearchResultSchema>;
export function workspaceSearchHref(result: WorkspaceSearchResult) {
  return result.kind === "character" ? `/characters/${result.id}` : `/studio/${result.id}`;
}
