import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { assertSameOrigin } from "@/lib/auth/security";
import { characterProfileEditSchema } from "@/lib/characters/contract";
import { createCharacterRepository } from "@/lib/characters/repository";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    const session = await requireWorkspaceSession();
    const repo = createCharacterRepository(session.supabase, session.authorId);
    return NextResponse.json({ role: await getWorkspaceRole(session), ...await repo.profileDetail(id) }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireLibraryEditor(request);
    const id = z.uuid().parse((await context.params).id);
    const { expectedVersion, displayName, summary, primaryPortraitId } = characterProfileEditSchema.parse(await libraryJson(request));
    const repo = createCharacterRepository(session.supabase, session.authorId);
    const profile = await repo.updateProfile(id, { displayName, summary, primaryPortraitId }, expectedVersion);
    return NextResponse.json({ profile }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
