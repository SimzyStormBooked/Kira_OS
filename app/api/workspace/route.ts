import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceSession,
  WorkspaceAccessError,
} from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import {
  createConnectedRepository,
  ConnectedRepositoryError,
} from "@/lib/db/connected-repository";
const decision = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve") }).strict(),
  z.object({ type: z.literal("reject") }).strict(),
  z
    .object({
      type: z.literal("edit"),
      draft: z.string().trim().min(1).max(10000),
    })
    .strict(),
]);
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("decide"),
      id: z.uuid(),
      decision,
      version: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("teach"),
      id: z.uuid(),
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z.object({ action: z.literal("queue"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("dismiss"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
  z
    .object({
      action: z.literal("create"),
      title: z.string().trim().min(1).max(200),
      draft: z.string().trim().min(1).max(10000),
    })
    .strict(),
]);
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers },
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return NextResponse.json(
      { error: "Check the request fields and try again." },
      { status: 400, headers },
    );
  if (error instanceof ConnectedRepositoryError) {
    const status =
      error.code === "40001"
        ? 409
        : error.code === "42501"
          ? 403
          : error.code === "P0002"
            ? 404
            : 503;
    return NextResponse.json(
      {
        error:
          status === 503
            ? "Could not save your workspace. Please try again."
            : error.message,
      },
      { status, headers },
    );
  }
  return NextResponse.json(
    { error: "Your workspace is unavailable. Please try again." },
    { status: 503, headers },
  );
}
export async function GET() {
  try {
    const session = await requireWorkspaceSession();
    const role = await getWorkspaceRole(session);
    return NextResponse.json(
      await createConnectedRepository(
        session.supabase,
        session.authorId,
      ).loadWorkspace(),
      { headers: { ...headers, "X-Kira-Workspace-Role": role } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    const role = await getWorkspaceRole(session);
    if (role === "viewer") throw new WorkspaceAccessError(403, "forbidden", "You have viewer access. An owner or editor can save changes.");
    // Bound the actual stream; do not trust Content-Length from a caller.
    const reader = request.body?.getReader();
    if (!reader)
      return NextResponse.json(
        { error: "A request body is required." },
        { status: 400, headers },
      );
    const decoder = new TextDecoder();
    let raw = "";
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return NextResponse.json(
          { error: "This brief is too large." },
          { status: 413, headers },
        );
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const input = command.parse(JSON.parse(raw));
    const repo = createConnectedRepository(session.supabase, session.authorId);
    const workspace = await (input.action === "decide"
      ? repo.decideApproval(input.id, input.decision, input.version)
      : input.action === "teach"
        ? repo.teachRaven(input.id, input.text)
        : input.action === "queue"
          ? repo.queueRecommendation(input.id)
          : input.action === "dismiss"
            ? repo.dismissRecommendation(input.id)
            : input.action === "create"
              ? repo.createManualReview(input.title, input.draft)
              : repo.restoreRecommendations());
    return NextResponse.json(workspace, { headers: { ...headers, "X-Kira-Workspace-Role": role } });
  } catch (error) {
    return failure(error);
  }
}
