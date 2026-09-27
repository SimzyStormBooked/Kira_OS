import "server-only";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manuscriptFormat } from "@/lib/manuscripts/contract";
import { EXPORT_TABLES, EXPORT_EXCLUSIONS } from "./tables";

export const ARCHIVE_LIMITS = { rows: 20_000, bytes: 75 * 1024 * 1024, pageSize: 500, files: 1000 } as const;
export class WorkspaceExportError extends Error {
  constructor(public readonly code: "limit" | "changed" | "unavailable" | "integrity") {
    super({ limit: "This workspace is too large for one download. Ask the workspace owner to arrange a larger export.", changed: "Workspace records changed while preparing the download. Please try again when editing and reading have finished.", unavailable: "The workspace archive could not read every required record or file. No archive was downloaded; please try again.", integrity: "A saved file or record could not be verified. No archive was downloaded. Ask the workspace owner to check storage." }[code]);
  }
}
type Row = Record<string, unknown>;
type Entry = { path: string; bytes: number; sha256: string; records?: number };
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const fileSchema = z.object({ id: z.uuid(), author_id: z.uuid(), storage_path: z.string(), size_bytes: z.number().int().positive(), content_hash: z.string().regex(/^[a-f0-9]{64}$/), mime_type: z.string(), status: z.string() });
const manuscriptSchema = fileSchema.extend({ book_id: z.uuid(), filename: z.string(), error_code: z.string().nullable() });
const portraitSchema = fileSchema.extend({ profile_id: z.uuid(), location_metadata_removed: z.boolean(), sanitized_at: z.string().nullable() });
const portraitExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
function unavailableObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; statusCode?: string | number; code?: string };
  return value.status === 404 || String(value.statusCode) === "404" || value.code === "NoSuchKey" || value.code === "not_found";
}

/** Owns no service-role client or global state. The route verifies ownership before and after this read. */
export async function buildWorkspaceArchive(supabase: SupabaseClient, authorId: string, signal: AbortSignal) {
  z.uuid().parse(authorId);
  const startedAt = new Date().toISOString();
  const zip = new JSZip();
  const records: Record<string, Row[]> = {};
  const entries: Entry[] = [];
  const unavailableFiles: Array<{ kind: "manuscript" | "portrait"; id: string; reason: string }> = [];
  let totalRows = 0, totalBytes = 0, binaryFiles = 0;
  function add(path: string, bytes: Uint8Array | string, count?: number) {
    signal.throwIfAborted();
    const content = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
    totalBytes += content.byteLength;
    if (totalBytes > ARCHIVE_LIMITS.bytes) throw new WorkspaceExportError("limit");
    zip.file(path, content, { date: new Date(startedAt), createFolders: false });
    entries.push({ path, bytes: content.byteLength, sha256: hash(content), ...(count === undefined ? {} : { records: count }) });
  }
  for (const table of EXPORT_TABLES) {
    signal.throwIfAborted();
    const rows: Row[] = [];
    let expectedCount: number | null = null;
    const seen = new Set<string>();
    for (let offset = 0; ; offset += ARCHIVE_LIMITS.pageSize) {
      const { data, error, count } = await supabase.from(table.name).select(table.columns, { count: "exact" })
        .eq(table.scope, authorId).order(table.key, { ascending: true })
        .range(offset, offset + ARCHIVE_LIMITS.pageSize - 1).abortSignal(signal);
      if (error || count === null || !Number.isSafeInteger(count) || !Array.isArray(data)) throw new WorkspaceExportError("unavailable");
      if (expectedCount !== null && expectedCount !== count) throw new WorkspaceExportError("changed");
      expectedCount = count;
      if (totalRows + count > ARCHIVE_LIMITS.rows) throw new WorkspaceExportError("limit");
      // Exact counts detect a lower server row cap, omitted pages, and mid-read deletion.
      if (data.length !== Math.min(ARCHIVE_LIMITS.pageSize, count - offset)) throw new WorkspaceExportError("changed");
      for (const value of data as unknown as Row[]) {
        const key = value[table.key];
        if (value[table.scope] !== authorId || typeof key !== "string" || !key || seen.has(key)) throw new WorkspaceExportError("integrity");
        seen.add(key);
        // Even a misbehaving transport cannot smuggle an unrequested column into the archive.
        rows.push(Object.fromEntries(table.columns.split(",").filter(column => column in value).map(column => [column, value[column]])));
      }
      if (rows.length === count) break;
    }
    totalRows += rows.length;
    records[table.name] = rows;
    add(`records/${table.name}.json`, JSON.stringify(rows, null, 2), rows.length);
  }
  if (records.authors.length !== 1) throw new WorkspaceExportError("unavailable");
  const books = new Set(records.books.map(row => row.id));
  const profiles = new Set(records.character_profiles.map(row => row.id));
  async function includeFile(bucket: "kira-manuscripts" | "kira-character-portraits", row: z.infer<typeof fileSchema>, path: string, allowedMissing: boolean) {
    signal.throwIfAborted();
    if (++binaryFiles > ARCHIVE_LIMITS.files || totalBytes + row.size_bytes > ARCHIVE_LIMITS.bytes) throw new WorkspaceExportError("limit");
    const { data, error } = await supabase.storage.from(bucket).download(row.storage_path, {}, { signal, cache: "no-store" });
    if (error || !data) {
      if (allowedMissing && unavailableObject(error)) {
        unavailableFiles.push({ kind: "manuscript", id: row.id, reason: "Original upload is not available; its record remains in the archive." });
        return;
      }
      throw new WorkspaceExportError("unavailable");
    }
    if (data.size !== row.size_bytes) throw new WorkspaceExportError("integrity");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (hash(bytes) !== row.content_hash) throw new WorkspaceExportError("integrity");
    add(path, bytes);
  }
  for (const value of records.manuscripts) {
    const parsed = manuscriptSchema.safeParse(value);
    if (!parsed.success) throw new WorkspaceExportError("integrity");
    const row = parsed.data, extension = manuscriptFormat(row.filename, row.mime_type);
    if (!extension || row.author_id !== authorId || !books.has(row.book_id) || row.size_bytes > 4 * 1024 * 1024 || row.storage_path !== `${authorId}/${row.book_id}/${row.id}.${extension}`) throw new WorkspaceExportError("integrity");
    await includeFile("kira-manuscripts", row, `files/manuscripts/${row.book_id}/${row.id}.${extension}`, row.status === "uploading" || (row.status === "failed" && row.error_code === "storage_error"));
  }
  for (const value of records.character_portraits) {
    const parsed = portraitSchema.safeParse(value);
    if (!parsed.success) throw new WorkspaceExportError("integrity");
    const row = parsed.data, extension = portraitExtensions[row.mime_type];
    if (!extension || row.author_id !== authorId || !profiles.has(row.profile_id) || row.size_bytes > 8 * 1024 * 1024 || row.storage_path !== `${authorId}/${row.profile_id}/${row.id}`) throw new WorkspaceExportError("integrity");
    if (row.status !== "ready") {
      unavailableFiles.push({ kind: "portrait", id: row.id, reason: "Portrait upload is unfinished or failed; only ready sanitized images are exported." });
      continue;
    }
    if (!row.location_metadata_removed || !row.sanitized_at) throw new WorkspaceExportError("integrity");
    await includeFile("kira-character-portraits", row, `files/portraits/${row.profile_id}/${row.id}.${extension}`, false);
  }
  const completedAt = new Date().toISOString();
  add("README.txt", [
    "KIRA OS PRIVATE WORKSPACE ARCHIVE", "",
    `Author: ${authorId}`, `Read started: ${startedAt}`, `Read completed: ${completedAt}`, "",
    "This is a portable records-and-files archive. It is not a point-in-time database backup and cannot be imported to restore KIRA OS.",
    "Records were read across the time window above. Avoid editing or starting new reading while exporting if you need a consistent reference copy.",
    "records/ contains JSON by table, including saved source evidence and author attribution. IDs preserve relationships between records.",
    "files/manuscripts/ contains originals under book ID / manuscript ID. The manuscripts JSON maps IDs to original filenames.",
    "files/portraits/ contains ready images after location metadata removal. Character records retain captions, credit and usage permissions.",
    "manifest.json lists every exported record/file with byte count and SHA-256 checksum. The manifest itself is not listed recursively.",
    `Unavailable files: ${unavailableFiles.length}. Read manifest.unavailable_files; no unavailable file is represented as downloaded.`, "",
    "EXCLUSIONS", ...EXPORT_EXCLUSIONS.map(value => `- ${value}`), "",
    "Keep this archive private. It contains manuscript text and private business records. Export does not expand your permission to publish or share any material.",
  ].join("\n"));
  const manifest = {
    format: "kira-workspace-archive-v1", author_id: authorId, started_at: startedAt, completed_at: completedAt,
    point_in_time_backup: false, importable_restore: false, total_records: totalRows,
    included_binary_files: entries.filter(entry => entry.path.startsWith("files/")).length,
    unavailable_files: unavailableFiles, exclusions: EXPORT_EXCLUSIONS, limits: ARCHIVE_LIMITS, entries,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  if (totalBytes + manifestBytes.length > ARCHIVE_LIMITS.bytes) throw new WorkspaceExportError("limit");
  zip.file("manifest.json", manifestBytes, { date: new Date(startedAt), createFolders: false });
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  signal.throwIfAborted();
  if (bytes.byteLength > ARCHIVE_LIMITS.bytes) throw new WorkspaceExportError("limit");
  return { bytes, sha256: hash(bytes), unavailableFiles: unavailableFiles.length, filename: `kira-workspace-${startedAt.slice(0, 10)}.zip` };
}
