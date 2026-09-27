import { NextResponse } from "next/server";
import { z } from "zod";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { createCharacterRepository } from "@/lib/characters/repository";
export const runtime = "nodejs";
import { characterNoteEditSchema } from "@/lib/characters/contract";
export async function PATCH(request: Request, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const session = await requireLibraryEditor(request);
    const params = await context.params, id = z.uuid().parse(params.id), noteId = z.uuid().parse(params.noteId);
    const { expectedVersion, ...input } = characterNoteEditSchema.parse(await libraryJson(request));
    const note = await createCharacterRepository(session.supabase, session.authorId).saveNote(id, input, noteId, expectedVersion);
    return NextResponse.json({ note }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
