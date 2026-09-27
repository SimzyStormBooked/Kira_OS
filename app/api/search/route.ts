import { NextResponse } from "next/server";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { workspaceSearchQuerySchema } from "@/lib/search/contract";
import { searchWorkspace } from "@/lib/search/repository";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession();
    const query = workspaceSearchQuerySchema.safeParse(new URL(request.url).searchParams.get("q"));
    if (!query.success) return NextResponse.json({ error: "Search with 2 to 200 characters." }, { status: 400, headers });
    const results = await searchWorkspace(session.supabase, session.authorId, query.data);
    return NextResponse.json({ results }, { headers });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Saved characters and Raven answers could not be searched. Try again." }, { status: 503, headers });
  }
}
