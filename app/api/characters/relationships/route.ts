import { NextResponse } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { characterRelationshipInputSchema } from "@/lib/characters/contract";
import { createCharacterRepository } from "@/lib/characters/repository";

export const runtime = "nodejs";

// A relationship connects two profiles, so it is listed at the workspace level rather than
// nested under either one's path. See the collection route: reads are session-guarded, not
// origin-guarded.
export async function GET() {
  try {
    const session = await requireWorkspaceSession();
    const repo = createCharacterRepository(session.supabase, session.authorId);
    return NextResponse.json({ role: await getWorkspaceRole(session), relationships: await repo.listAllRelationships() }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireLibraryEditor(request);
    const { profileId, ...input } = characterRelationshipInputSchema.parse(await libraryJson(request));
    const repo = createCharacterRepository(session.supabase, session.authorId);
    const relationship = await repo.createRelationship(profileId, input);
    return NextResponse.json({ relationship }, { status: 201, headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
