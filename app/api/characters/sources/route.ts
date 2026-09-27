import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { libraryFailure, privateHeaders } from "@/lib/manuscripts/http";
import { createCharacterRepository } from "@/lib/characters/repository";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession();
    const book = new URL(request.url).searchParams.get("book");
    const bookId = book ? z.uuid().parse(book) : undefined;
    const repo = createCharacterRepository(session.supabase, session.authorId);
    return NextResponse.json({ sources: await repo.listSources(bookId) }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
