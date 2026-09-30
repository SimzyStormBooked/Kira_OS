import { NextResponse } from "next/server";
import { z } from "zod";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { createCharacterRepository } from "@/lib/characters/repository";
import { characterRelationshipEditSchema } from "@/lib/characters/contract";

export const runtime = "nodejs";
type Context = { params: Promise<{ relationshipId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireLibraryEditor(request);
    const relationshipId = z.uuid().parse((await context.params).relationshipId);
    const { expectedVersion, ...input } = characterRelationshipEditSchema.parse(await libraryJson(request));
    const repo = createCharacterRepository(session.supabase, session.authorId);
    const relationship = await repo.updateRelationship(relationshipId, input, expectedVersion);
    return NextResponse.json({ relationship }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireLibraryEditor(request);
    const relationshipId = z.uuid().parse((await context.params).relationshipId);
    await createCharacterRepository(session.supabase, session.authorId).deleteRelationship(relationshipId);
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
