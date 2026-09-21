import { NextResponse } from "next/server";
import { z } from "zod";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { libraryFailure, libraryJson, ManuscriptError, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { getStudioAvailability } from "@/lib/ai/studio-provider";
import { runManuscriptExtraction } from "@/lib/ai/provider";
import { emptyManuscriptUsage, ManuscriptProviderError } from "@/lib/manuscripts/provider";
export const runtime = "nodejs";
export const maxDuration = 90;
const inputSchema = z.object({ requestId: z.uuid(), retry: z.boolean().default(false) }).strict();
async function persist(write: () => Promise<unknown>) { try { return await write(); } catch { return write(); } }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLibraryEditor(request); const id = z.uuid().parse((await context.params).id);
    const input = inputSchema.parse(await libraryJson(request)); const repo = createManuscriptRepository(session.supabase, session.authorId);
    await repo.findManuscript(id);
    const availability = await getStudioAvailability();
    if (!availability.available) throw new ManuscriptError("ai_unavailable", 503, availability.message.replace("Ask Raven", "Manuscript reading"));
    // The database verifies stored permission, roles, limits and version before reserving exact source chunks.
    const started = await repo.beginBatch(id, input.requestId, input.retry);
    if (started.created) {
      let reply;
      try { reply = await runManuscriptExtraction(started.chunks, { sourceApproved: true }); }
      catch (error) {
        const code = error instanceof ManuscriptProviderError ? error.code : "provider_unavailable";
        const usage = error instanceof ManuscriptProviderError ? error.usage : emptyManuscriptUsage();
        await persist(() => repo.finishBatch(id, input.requestId, null, usage, [], code));
        throw new ManuscriptError(code, 503, "Raven could not finish this reading step. Completed passages are saved. Review the status, then retry when ready.");
      }
      await persist(() => repo.finishBatch(id, input.requestId, reply.result, reply.usage, reply.embeddings, null));
    }
    const saved = await repo.findManuscript(id);
    return NextResponse.json({ status: saved.status, pending: !started.created && saved.status === "processing", completedChunks: saved.completed_chunks, chunkCount: saved.chunk_count }, { status: started.created || saved.status === "ready" ? 200 : 202, headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
