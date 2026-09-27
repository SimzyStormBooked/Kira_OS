import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildWorkspaceArchive } from "@/lib/workspace-export/archive";
import { EXPORT_TABLES } from "@/lib/workspace-export/tables";
const author = "10000000-0000-4000-8000-000000000001", book = "20000000-0000-4000-8000-000000000001", manuscript = "30000000-0000-4000-8000-000000000001", profile = "40000000-0000-4000-8000-000000000001", portrait = "50000000-0000-4000-8000-000000000001";
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type Row = Record<string, unknown>;
function client(extra: Record<string, Row[]> = {}, objects: Record<string, string> = {}, modify?: (table: string, offset: number, result: { data: Row[]; count: number; error: null | object }) => void) {
  const tables: Record<string, Row[]> = { authors: [{ id: author, name: "Synthetic author", ciphertext: "MUST_NOT_EXPORT" }], books: [{ id: book, author_id: author, title: "Synthetic book" }], ...extra };
  const calls: Array<{ table: string; scope?: string; value?: string; columns?: string; offset?: number }> = [];
  const downloads: string[] = [];
  return {
    calls, downloads,
    supabase: {
      from(table: string) {
        const call: typeof calls[number] = { table }; calls.push(call);
        const query = {
          select(columns: string) { call.columns = columns; return query; },
          eq(scope: string, value: string) { call.scope = scope; call.value = value; return query; },
          order() { return query; }, range(offset: number) { call.offset = offset; return query; },
          async abortSignal() {
            const all = tables[table] ?? [], offset = call.offset ?? 0;
            const result = { data: all.slice(offset, offset + 500), count: all.length, error: null as object | null };
            modify?.(table, offset, result); return result;
          },
        }; return query;
      },
      storage: { from(bucket: string) { return { async download(path: string) {
        const key = `${bucket}/${path}`; downloads.push(key);
        return key in objects ? { data: new Blob([objects[key]]), error: null } : { data: null, error: { statusCode: "404" } };
      } }; } },
    } as unknown as SupabaseClient,
  };
}
const manuscriptRow = (status = "ready") => ({ id: manuscript, author_id: author, book_id: book, storage_path: `${author}/${book}/${manuscript}.txt`, size_bytes: 8, content_hash: sha("original"), mime_type: "text/plain", filename: "author-source.txt", status, error_code: status === "failed" ? "storage_error" : null });
const portraitRow = () => ({ id: portrait, author_id: author, profile_id: profile, storage_path: `${author}/${profile}/${portrait}`, size_bytes: 9, content_hash: sha("sanitized"), mime_type: "image/png", status: "ready", location_metadata_removed: true, sanitized_at: "2026-09-26T00:00:00Z" });
const signal = () => new AbortController().signal;
describe("portable workspace archive", () => {
  it("packages originals, safe records, relationships, checksums and explicit limitations", async () => {
    const c = client({ manuscripts: [manuscriptRow()], character_profiles: [{ id: profile, author_id: author }], character_portraits: [portraitRow()] }, { [`kira-manuscripts/${author}/${book}/${manuscript}.txt`]: "original", [`kira-character-portraits/${author}/${profile}/${portrait}`]: "sanitized" });
    const archive = await buildWorkspaceArchive(c.supabase, author, signal());
    expect(sha(archive.bytes)).toBe(archive.sha256);
    const zip = await JSZip.loadAsync(archive.bytes);
    expect(await zip.file(`files/manuscripts/${book}/${manuscript}.txt`)!.async("string")).toBe("original");
    expect(await zip.file(`files/portraits/${profile}/${portrait}.png`)!.async("string")).toBe("sanitized");
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest).toMatchObject({ author_id: author, point_in_time_backup: false, importable_restore: false, included_binary_files: 2, unavailable_files: [] });
    expect(await zip.file("records/authors.json")!.async("string")).not.toContain("MUST_NOT_EXPORT");
    for (const entry of manifest.entries) expect(sha(await zip.file(entry.path)!.async("uint8array"))).toBe(entry.sha256);
    expect(c.calls).toHaveLength(EXPORT_TABLES.length);
    expect(c.calls.every(call => call.value === author && call.columns !== "*")).toBe(true);
  });
  it("walks stable 500-row pages and refuses truncation or changing counts", async () => {
    const links = Array.from({ length: 501 }, (_, index) => ({ id: String(index), author_id: author, label: "Synthetic link" }));
    const c = client({ workspace_links: links });
    const zip = await JSZip.loadAsync((await buildWorkspaceArchive(c.supabase, author, signal())).bytes);
    expect(JSON.parse(await zip.file("records/workspace_links.json")!.async("string"))).toHaveLength(501);
    expect(c.calls.filter(call => call.table === "workspace_links").map(call => call.offset)).toEqual([0, 500]);
    const truncated = client({ workspace_links: links }, {}, (table, offset, result) => { if (table === "workspace_links" && offset === 0) result.data = result.data.slice(0, 100); });
    await expect(buildWorkspaceArchive(truncated.supabase, author, signal())).rejects.toMatchObject({ code: "changed" });
    const changed = client({ workspace_links: links }, {}, (table, offset, result) => { if (table === "workspace_links" && offset === 500) result.count++; });
    await expect(buildWorkspaceArchive(changed.supabase, author, signal())).rejects.toMatchObject({ code: "changed" });
  });
  it("fails closed for wrong author/path/checksum, missing ready file, query error and row limit", async () => {
    const cases = [
      client({ books: [{ id: book, author_id: profile }] }),
      client({ manuscripts: [{ ...manuscriptRow(), storage_path: `../${manuscript}.txt` }] }),
      client({ manuscripts: [manuscriptRow()] }),
      client({ manuscripts: [manuscriptRow()] }, { [`kira-manuscripts/${author}/${book}/${manuscript}.txt`]: "modified" }),
      client({}, {}, (table, _offset, result) => { if (table === "books") result.error = { code: "denied" }; }),
      client({}, {}, (table, _offset, result) => { if (table === "books") result.count = 20_001; }),
    ];
    for (const c of cases) await expect(buildWorkspaceArchive(c.supabase, author, signal())).rejects.toThrow();
    expect(cases[1].downloads).toEqual([]);
  });
  it("names unfinished missing files and excludes unsanitized portrait bytes", async () => {
    const c = client({ manuscripts: [manuscriptRow("uploading")], character_profiles: [{ id: profile, author_id: author }], character_portraits: [{ ...portraitRow(), status: "uploading", location_metadata_removed: false, sanitized_at: null }] });
    const archive = await buildWorkspaceArchive(c.supabase, author, signal());
    const zip = await JSZip.loadAsync(archive.bytes);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(archive.unavailableFiles).toBe(2); expect(manifest.unavailable_files).toHaveLength(2);
    expect(c.downloads).toHaveLength(1);
  });
});
