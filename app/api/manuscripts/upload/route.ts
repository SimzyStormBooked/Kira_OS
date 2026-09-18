import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createManuscriptRepository, manuscriptSummary } from "@/lib/manuscripts/repository";
import { MANUSCRIPT_MAX_BYTES, manuscriptFormat } from "@/lib/manuscripts/contract";
import { ManuscriptParseError, parseManuscript } from "@/lib/manuscripts/parser";
import { boundedBody, libraryFailure, ManuscriptError, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
export const runtime = "nodejs";
export const maxDuration = 60;
const mimeTypes = { txt: "text/plain", md: "text/markdown", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", epub: "application/epub+zip", pdf: "application/pdf" };
export async function POST(request: Request) {
  try {
    const session = await requireLibraryEditor(request);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new SyntaxError("Choose a file");
    const bytes = await boundedBody(request, MANUSCRIPT_MAX_BYTES + 65536);
    const form = await new Response(bytes as BodyInit, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    if ([...form.keys()].some(key => !["bookId", "file", "permission"].includes(key)) || ["bookId", "file", "permission"].some(key => form.getAll(key).length !== 1)) throw new SyntaxError("Invalid upload fields");
    const bookId = z.uuid().parse(form.get("bookId"));
    if (form.get("permission") !== "true") throw new ManuscriptError("permission_required", 400, "Confirm that you have permission to upload and analyze this manuscript.");
    const file = form.get("file"); if (!(file instanceof File)) throw new SyntaxError("Choose a file");
    const format = manuscriptFormat(file.name, file.type);
    if (!format || file.size > MANUSCRIPT_MAX_BYTES) throw new ManuscriptError("invalid_file", 400, "Choose a DOCX, PDF, EPUB, TXT or Markdown manuscript under 4 MB.");
    const repo = createManuscriptRepository(session.supabase, session.authorId);
    await repo.findBook(bookId);
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseManuscript(buffer, file.name, file.type);
    const hash = createHash("sha256").update(buffer).digest("hex"); const id = randomUUID();
    const row = await repo.register({ id, bookId, filename: file.name, mime: mimeTypes[format], bytes: buffer.length, hash });
    const duplicate = row.id !== id;
    if (row.status !== "uploading") return NextResponse.json({ manuscript: manuscriptSummary(row), bookId, duplicate }, { headers: privateHeaders });
    const storage = session.supabase.storage.from("kira-manuscripts");
    const { error: uploadError } = await storage.upload(row.storage_path, buffer, { contentType: mimeTypes[format], upsert: false, cacheControl: "0" });
    if (uploadError) {
      // A lost HTTP response may leave the original object present; verify its bytes before attaching chunks.
      const { data: original, error: readError } = await storage.download(row.storage_path);
      if (readError || !original || original.size !== buffer.length || createHash("sha256").update(Buffer.from(await original.arrayBuffer())).digest("hex") !== hash) {
        await repo.failUpload(row.id);
        throw new ManuscriptError("storage_error", 503, "The private file upload did not finish. Select the same file and try again; no analysis has run.");
      }
    }
    await repo.storeChunks(row.id, parsed.chunks);
    return NextResponse.json({ manuscript: manuscriptSummary(await repo.findManuscript(row.id)), bookId, duplicate }, { status: duplicate ? 200 : 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof ManuscriptParseError) return NextResponse.json({ error: error.message }, { status: 422, headers: privateHeaders });
    return libraryFailure(error);
  }
}
