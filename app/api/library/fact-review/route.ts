import { NextResponse } from "next/server";
import { z } from "zod";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { checkLibraryError } from "@/lib/manuscripts/repository";
import { bookFactReviewSchema } from "@/lib/manuscripts/library-contract";

const input = z.object({
  manuscriptId: z.uuid(), factIndex: z.number().int().min(0).max(7999),
  judgement: z.enum(["confirmed", "needs_check", "do_not_use"]),
  authorNote: z.string().trim().max(1200),
}).strict();

export async function POST(request: Request) {
  try {
    const session = await requireLibraryEditor(request);
    const body = input.parse(await libraryJson(request));
    const { data, error } = await session.supabase.rpc("book_fact_review_save", {
      p_author_id: session.authorId, p_manuscript_id: body.manuscriptId,
      p_fact_index: body.factIndex, p_judgement: body.judgement, p_author_note: body.authorNote,
    });
    checkLibraryError(error);
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ review: bookFactReviewSchema.parse(row) }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
