import { NextResponse } from "next/server";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { buildWorkspaceArchive, WorkspaceExportError } from "@/lib/workspace-export/archive";

export const runtime = "nodejs";
export const maxDuration = 300;
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession();
    const assertOwner = async () => {
      if (await getWorkspaceRole(session) !== "owner") throw new WorkspaceAccessError(403, "forbidden", "Only the workspace owner can download the full archive.");
    };
    await assertOwner();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    const archive = await buildWorkspaceArchive(session.supabase, session.authorId, signal);
    await assertOwner();
    signal.throwIfAborted();
    let offset = 0;
    // All reads and checks finish before response headers. Stream the verified ZIP in
    // bounded chunks (without Content-Length) for Vercel's streaming response path.
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (signal.aborted) { controller.error(new Error("Download interrupted")); return; }
        if (offset >= archive.bytes.length) { controller.close(); return; }
        const end = Math.min(offset + 64 * 1024, archive.bytes.length);
        controller.enqueue(archive.bytes.slice(offset, end)); offset = end;
      },
    });
    return new Response(stream, { headers: { ...privateHeaders, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${archive.filename}"`, "X-Kira-Archive-SHA256": archive.sha256, "X-Kira-Archive-Bytes": String(archive.bytes.length), "X-Kira-Unavailable-Files": String(archive.unavailableFiles) } });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    if (error instanceof WorkspaceExportError) return NextResponse.json({ error: error.message }, { status: error.code === "limit" ? 413 : error.code === "changed" ? 409 : 503, headers: privateHeaders });
    return NextResponse.json({ error: "The workspace archive could not be completed. No archive was downloaded; please try again." }, { status: 503, headers: privateHeaders });
  }
}
