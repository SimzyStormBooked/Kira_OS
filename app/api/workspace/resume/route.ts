import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { resumeAnswerSchema, resumeBookSchema, workspaceResumeSchema } from "@/lib/workspace-resume";
import { createCharacterRepository } from "@/lib/characters/repository";
import { authorArtwork } from "@/lib/author-artwork";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
const manuscriptSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), status: z.enum(["uploading", "queued", "processing", "ready", "failed", "withdrawn"]), completed_chunks: z.number().int().nonnegative(), chunk_count: z.number().int().nonnegative() });
const jobSchema = z.object({ state: z.enum(["queued", "running", "paused", "needs_attention", "complete"]) });
function check(error: unknown) { if (error) throw new Error("Resume summary unavailable"); }

/** A small caller-scoped summary: no questions, answer bodies or manuscript text. */
export async function GET() {
  try {
    const session = await requireWorkspaceSession();
    await getWorkspaceRole(session);
    const { supabase, authorId } = session;
    const [bookRows, answerRow, showcase] = await Promise.all([
      supabase.from("books").select("id,slug,title,updated_at,active_manuscript_id").eq("author_id", authorId).neq("data_origin", "demo").order("updated_at", { ascending: false }).order("id").limit(2),
      supabase.from("workspace_generations").select("id,title:result->>title,created_at,completed_at").eq("author_id", authorId).eq("status", "complete").order("completed_at", { ascending: false }).order("id").limit(1).maybeSingle(),
      createCharacterRepository(supabase, authorId).listShowcase(),
    ]);
    check(bookRows.error); check(answerRow.error);
    const books = await Promise.all(resumeBookSchema.array().parse(bookRows.data ?? []).map(async book => {
      const version = await supabase.from("manuscripts").select("id,version,status,completed_chunks,chunk_count").eq("author_id", authorId).eq("book_id", book.id).order("version", { ascending: false }).limit(1).maybeSingle();
      check(version.error);
      const reading = manuscriptSchema.nullable().parse(version.data);
      if (!reading) return { ...book, reading: null };
      const job = await supabase.from("manuscript_reading_jobs").select("state").eq("author_id", authorId).eq("manuscript_id", reading.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      check(job.error);
      return { ...book, reading: { ...reading, job_state: jobSchema.nullable().parse(job.data)?.state ?? null } };
    }));
    return NextResponse.json(workspaceResumeSchema.parse({ books, answer: resumeAnswerSchema.nullable().parse(answerRow.data), showcase, artwork: authorArtwork(authorId) }), { headers });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Your saved work could not be loaded. Please try again." }, { status: 503, headers });
  }
}
