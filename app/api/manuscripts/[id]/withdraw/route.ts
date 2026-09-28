import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLibraryEditor, libraryFailure, ManuscriptError, privateHeaders } from "@/lib/manuscripts/http";
import { checkLibraryError } from "@/lib/manuscripts/repository";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const session = await requireLibraryEditor(request);
    const id = z.uuid().parse((await context.params).id);
    const key = process.env.KIRA_AI_RECORDING_KEY;
    if (!key) throw new ManuscriptError("unconfigured", 503, "Manuscript withdrawal needs the private workspace connection.");
    const { data, error } = await session.supabase.rpc("manuscript_withdraw", {
      p_author_id: session.authorId, p_id: id, p_recording_key: key,
    });
    checkLibraryError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.status !== "withdrawn") throw new ManuscriptError("unavailable", 503, "Withdrawal could not be confirmed. Refresh and try again.");
    return NextResponse.json({ withdrawn: true }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
