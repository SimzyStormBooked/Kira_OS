import { NextResponse } from "next/server";
import { z } from "zod";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { createCharacterRepository } from "@/lib/characters/repository";
export const runtime = "nodejs";
import { characterLinkInputSchema } from "@/lib/characters/contract";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLibraryEditor(request);
    const id = z.uuid().parse((await context.params).id);
    const input = characterLinkInputSchema.parse(await libraryJson(request));
    await createCharacterRepository(session.supabase, session.authorId).linkCharacter(id, input);
    return NextResponse.json({ saved: true }, { status: 201, headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLibraryEditor(request);
    const id = z.uuid().parse((await context.params).id);
    const { linkId } = z.object({ linkId: z.uuid() }).parse(await libraryJson(request));
    await createCharacterRepository(session.supabase, session.authorId).unlinkCharacter(id, linkId);
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
