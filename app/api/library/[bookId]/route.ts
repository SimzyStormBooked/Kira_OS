import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { libraryInputSchema, bookDetailSchema } from "@/lib/manuscripts/library-contract";
import { libraryFailure, libraryJson, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
type Context = { params: Promise<{ bookId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const session = await requireWorkspaceSession();
    const id = z.uuid().parse((await context.params).bookId);
    const [role, detail] = await Promise.all([getWorkspaceRole(session), createManuscriptRepository(session.supabase, session.authorId).detail(id)]);
    return NextResponse.json(bookDetailSchema.parse({ ...detail, role }), { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireLibraryEditor(request);
    const id = z.uuid().parse((await context.params).bookId);
    const input = libraryInputSchema.parse(await libraryJson(request));
    const book = await createManuscriptRepository(session.supabase, session.authorId).saveBook(input, id);
    return NextResponse.json({ book }, { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
