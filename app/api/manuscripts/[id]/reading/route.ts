import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { createManuscriptRepository, checkLibraryError } from "@/lib/manuscripts/repository";
import { libraryFailure, libraryJson, ManuscriptError, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { getStudioAvailability } from "@/lib/ai/studio-provider";
import { readingJobSchema } from "@/lib/manuscripts/reading-job";
import { readManuscriptInBackground } from "@/workflows/manuscript-reading";
export const runtime = "nodejs";
export const maxDuration = 90;
const inputSchema = z.object({ action: z.enum(["start", "pause"]), retry: z.boolean().default(false) }).strict();
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const session = await requireWorkspaceSession(); const id = z.uuid().parse((await context.params).id);
    await createManuscriptRepository(session.supabase, session.authorId).findManuscript(id);
    const { data, error } = await session.supabase.from("manuscript_reading_jobs").select("id,manuscript_id,state,error_code,updated_at").eq("author_id", session.authorId).eq("manuscript_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    checkLibraryError(error);
    return NextResponse.json({ job: readingJobSchema.nullable().parse(data) }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const session = await requireLibraryEditor(request); const id = z.uuid().parse((await context.params).id);
    const input = inputSchema.parse(await libraryJson(request));
    await createManuscriptRepository(session.supabase, session.authorId).findManuscript(id);
    if (input.action === "start") {
      const availability = await getStudioAvailability();
      if (!availability.available) throw new ManuscriptError("ai_unavailable", 503, availability.message.replace("Ask Raven", "Manuscript reading"));
    }
    const key = process.env.KIRA_AI_RECORDING_KEY;
    if (!key) throw new ManuscriptError("unconfigured", 503);
    const { data, error } = await session.supabase.rpc("manuscript_reading_control", { p_author_id: session.authorId, p_id: id, p_action: input.action, p_retry: input.retry, p_recording_key: key });
    checkLibraryError(error);
    const job = readingJobSchema.nullable().parse(data);
    // Duplicate delivery is safe: the first worker atomically binds its run to the job.
    if (input.action === "start" && job?.state === "queued") await start(readManuscriptInBackground, [job.id]);
    return NextResponse.json({ job }, { status: 202, headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
