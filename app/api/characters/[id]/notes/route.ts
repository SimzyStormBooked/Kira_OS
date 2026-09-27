import { NextResponse } from "next/server";
import { z } from "zod";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { createCharacterRepository } from "@/lib/characters/repository";
export const runtime = "nodejs";
import { characterNoteInputSchema } from "@/lib/characters/contract";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLibraryEditor(request);
    const id = z.uuid().parse((await context.params).id);
    const input = characterNoteInputSchema.parse(await libraryJson(request));
    const note = await createCharacterRepository(session.supabase, session.authorId).saveNote(id, input);
    return NextResponse.json({ note }, { status: 201, headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
