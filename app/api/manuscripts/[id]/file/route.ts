import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { manuscriptFileSchema } from "@/lib/manuscripts/library-contract";
import { ManuscriptError, libraryFailure, privateHeaders } from "@/lib/manuscripts/http";

/**
 * A short-lived download link for a manuscript version the caller may already
 * read. Storage access stays under the existing kira_manuscript_read policy on
 * the caller-scoped client: this route adds no capability and no service role,
 * and it never copies the file anywhere outside the workspace.
 */
const LINK_SECONDS = 60;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspaceSession();
    const id = z.uuid().parse((await context.params).id);
    const manuscript = await createManuscriptRepository(session.supabase, session.authorId).findManuscript(id);
    const { data, error } = await session.supabase.storage
      .from("kira-manuscripts")
      .createSignedUrl(manuscript.storage_path, LINK_SECONDS, { download: manuscript.filename });
    if (error || !data?.signedUrl) throw new ManuscriptError("download_unavailable", 503, "This version could not be prepared for download right now. Your file is untouched; try again in a moment.");
    return NextResponse.json(
      manuscriptFileSchema.parse({ url: data.signedUrl, filename: manuscript.filename, expires_in_seconds: LINK_SECONDS }),
      { headers: privateHeaders },
    );
  } catch (error) { return libraryFailure(error); }
}
