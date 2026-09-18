import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { searchResponseSchema } from "@/lib/manuscripts/library-contract";
import { libraryFailure, privateHeaders } from "@/lib/manuscripts/http";
/** Read-only lexical retrieval is free. Stored embeddings support future semantic jobs. */
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession(); const params = new URL(request.url).searchParams;
    const query = z.string().trim().min(2).max(300).parse(params.get("q"));
    const bookId = params.has("bookId") ? z.uuid().parse(params.get("bookId")) : null;
    const found = await createManuscriptRepository(session.supabase, session.authorId).search(query, bookId);
    return NextResponse.json(searchResponseSchema.parse(found), { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
