import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { boundedBody, libraryFailure, ManuscriptError, privateHeaders, requireLibraryEditor } from "@/lib/manuscripts/http";
import { PORTRAIT_MAX_BYTES, PORTRAIT_MIME_TYPES, PORTRAIT_USAGE_PERMISSIONS, portraitFormat } from "@/lib/characters/contract";
import { PortraitImageError, sanitizePortraitImage } from "@/lib/characters/image";
import { createCharacterRepository, portraitSummary } from "@/lib/characters/repository";

export const runtime = "nodejs";
export const maxDuration = 60;
const fields = ["profileId", "file", "permission", "usagePermission", "sourceCredit", "caption"];
const optional = z.string().trim().max(300).nullish().transform(value => value?.length ? value : null);

export async function POST(request: Request) {
  try {
    const session = await requireLibraryEditor(request);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new SyntaxError("Choose an image");
    const bytes = await boundedBody(request, PORTRAIT_MAX_BYTES + 65536);
    const form = await new Response(bytes as BodyInit, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    if ([...form.keys()].some(key => !fields.includes(key))) throw new SyntaxError("Invalid portrait fields");
    if (["profileId", "file", "permission"].some(key => form.getAll(key).length !== 1)) throw new SyntaxError("Invalid portrait fields");
    const profileId = z.uuid().parse(form.get("profileId"));
    if (form.get("permission") !== "true")
      throw new ManuscriptError("permission_required", 400, "Confirm that you have permission to keep this image privately in your workspace.");
    const usagePermission = z.enum(PORTRAIT_USAGE_PERMISSIONS).default("private_reference_only").parse(form.get("usagePermission") ?? undefined);
    const sourceCredit = optional.parse(form.get("sourceCredit"));
    const caption = optional.parse(form.get("caption"));
    // Private reference permission is not permission to publish; promotion needs a recorded source.
    if (usagePermission === "promotional_approved" && !sourceCredit)
      throw new ManuscriptError("credit_required", 400, "Record where this image came from and who may use it before marking it approved for promotion.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new SyntaxError("Choose an image");
    const format = portraitFormat(file.name, file.type);
    if (!format || file.size > PORTRAIT_MAX_BYTES)
      throw new ManuscriptError("invalid_file", 400, "Choose a PNG, JPEG or WebP portrait under 8 MB.");

    const repo = createCharacterRepository(session.supabase, session.authorId);
    await repo.findProfile(profileId);
    // Metadata is removed before anything is registered or stored, so an image that cannot
    // be cleaned never reaches private storage and never creates a record.
    const sanitized = sanitizePortraitImage(Buffer.from(await file.arrayBuffer()), format);
    const hash = createHash("sha256").update(sanitized.bytes).digest("hex");
    const id = randomUUID();
    const row = await repo.register({
      id, profileId, mime: PORTRAIT_MIME_TYPES[format], bytes: sanitized.bytes.length, hash, caption, sourceCredit, usagePermission,
    });
    const duplicate = row.id !== id;
    if (row.status === "ready") return NextResponse.json({ portrait: portraitSummary(row), duplicate: true }, { headers: privateHeaders });

    const storage = session.supabase.storage.from("kira-character-portraits");
    const { error: uploadError } = await storage.upload(row.storage_path, sanitized.bytes, {
      contentType: PORTRAIT_MIME_TYPES[format], upsert: false, cacheControl: "0",
    });
    if (uploadError) {
      // A lost response may have stored the object already; confirm the exact bytes before claiming success.
      const { data: stored, error: readError } = await storage.download(row.storage_path);
      const storedBytes = stored ? Buffer.from(await stored.arrayBuffer()) : null;
      if (readError || !storedBytes || createHash("sha256").update(storedBytes).digest("hex") !== hash) {
        await repo.fail(row.id, "storage_error");
        throw new ManuscriptError("storage_error", 503, "The private image upload did not finish. Choose the same file and try again; nothing was kept.");
      }
    }
    const finished = await repo.finish(row.id, sanitized.width, sanitized.height);
    return NextResponse.json(
      { portrait: portraitSummary(finished), duplicate, removed: sanitized.removed },
      { status: duplicate ? 200 : 201, headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof PortraitImageError)
      return NextResponse.json({ error: error.message }, { status: 422, headers: privateHeaders });
    return libraryFailure(error);
  }
}
