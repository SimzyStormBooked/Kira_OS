import { NextResponse } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { characterProfileInputSchema } from "@/lib/characters/contract";
import { createCharacterRepository } from "@/lib/characters/repository";

export const runtime = "nodejs";

// A read is guarded by the verified session and RLS. Browsers omit Origin on a same-origin
// GET, so an origin check here would reject the app's own request.
export async function GET() {
  try {
    const session = await requireWorkspaceSession();
    const repo = createCharacterRepository(session.supabase, session.authorId);
    return NextResponse.json({ role: await getWorkspaceRole(session), profiles: await repo.listProfiles() }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireLibraryEditor(request);
    const input = characterProfileInputSchema.parse(await libraryJson(request));
    const repo = createCharacterRepository(session.supabase, session.authorId);
    return NextResponse.json({ profile: await repo.createProfile(input) }, { status: 201, headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
