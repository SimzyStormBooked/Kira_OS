import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { sourceResponseSchema } from "@/lib/manuscripts/library-contract";
import { libraryFailure, privateHeaders } from "@/lib/manuscripts/http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspaceSession(); const id = z.uuid().parse((await context.params).id);
    const chunk = z.uuid().parse(new URL(request.url).searchParams.get("chunk"));
    const source = await createManuscriptRepository(session.supabase, session.authorId).source(id, chunk);
    return NextResponse.json(sourceResponseSchema.parse(source), { headers: privateHeaders });
  } catch (error) { return libraryFailure(error); }
}
