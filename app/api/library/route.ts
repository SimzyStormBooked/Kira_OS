import { NextResponse } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { libraryInputSchema, libraryResponseSchema } from "@/lib/manuscripts/library-contract";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
export async function GET() {
  try {
    const session = await requireWorkspaceSession();
    const [role, library] = await Promise.all([getWorkspaceRole(session), createManuscriptRepository(session.supabase, session.authorId).list()]);
    return NextResponse.json(libraryResponseSchema.parse({ ...library, role }), { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
export async function POST(request: Request) {
  try {
    const session = await requireLibraryEditor(request);
    const input = libraryInputSchema.parse(await libraryJson(request));
    const book = await createManuscriptRepository(session.supabase, session.authorId).saveBook(input);
    return NextResponse.json({ book }, { status: 201, headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
