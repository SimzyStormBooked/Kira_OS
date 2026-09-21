import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
vi.mock("@/lib/characters/repository", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/characters/repository")>(), createCharacterRepository: vi.fn() }));
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { createCharacterRepository } from "@/lib/characters/repository";
import { sanitizePortraitImage } from "@/lib/characters/image";
import { POST as uploadPortrait } from "@/app/api/characters/portraits/route";

const authorId = randomUUID(), userId = randomUUID(), profileId = randomUUID(), portraitId = randomUUID();
const gps = "GPSLatitude 33.4484 N";
function pngChunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}
function pngWithExif() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(800, 0); ihdr.writeUInt32BE(1000, 4); ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr), pngChunk("eXIf", Buffer.from(gps, "latin1")),
    pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x01])), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
const clean = sanitizePortraitImage(pngWithExif(), "png");
const cleanHash = createHash("sha256").update(clean.bytes).digest("hex");
const row = {
  id: portraitId, author_id: authorId, profile_id: profileId, storage_path: `${authorId}/${profileId}/${portraitId}`,
  status: "uploading" as const, mime_type: "image/png", size_bytes: clean.bytes.length, content_hash: cleanHash,
  width: null, height: null, caption: "Reference board", source_credit: null,
  usage_permission: "private_reference_only" as const, location_metadata_removed: false,
  sanitized_at: null, error_code: null, created_at: new Date().toISOString(),
};
const ready = { ...row, status: "ready" as const, location_metadata_removed: true, sanitized_at: new Date().toISOString(), width: 800, height: 1000 };
const repo = { findProfile: vi.fn(), findPortrait: vi.fn(), register: vi.fn(), finish: vi.fn(), fail: vi.fn() };
const storage = { upload: vi.fn(), download: vi.fn() };
const supabase = { storage: { from: vi.fn(() => storage) } };
const origin = "https://kira.test";

function upload(options: { permission?: boolean; body?: Buffer; name?: string; type?: string; usage?: string; credit?: string; site?: string | null } = {}) {
  const form = new FormData();
  form.set("profileId", profileId);
  form.set("permission", String(options.permission ?? true));
  if (options.usage) form.set("usagePermission", options.usage);
  if (options.credit) form.set("sourceCredit", options.credit);
  form.set("caption", "Reference board");
  const bytes = options.body ?? pngWithExif();
  form.set("file", new File([new Uint8Array(bytes)], options.name ?? "celine.png", { type: options.type ?? "image/png" }));
  const site = options.site === undefined ? origin : options.site;
  return new Request(`${origin}/api/characters/portraits`, { method: "POST", headers: { ...(site ? { origin: site } : {}) }, body: form });
}
const uploadedBytes = () => Buffer.from(storage.upload.mock.calls[0][1] as Uint8Array);
const registeredId = () => (repo.register.mock.calls[0][0] as { id: string }).id;

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.mocked(requireWorkspaceSession).mockResolvedValue({ mode: "connected", configured: true, authorization: "authorized", authorId, user: { id: userId, email: "fixture@example.test" }, supabase: supabase as unknown as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"] });
  vi.mocked(getWorkspaceRole).mockResolvedValue("editor");
  vi.mocked(createCharacterRepository).mockReturnValue(repo as unknown as ReturnType<typeof createCharacterRepository>);
  repo.findProfile.mockResolvedValue({ id: profileId, display_name: "Celine" });
  // The real function returns the row for the ID it was given, so the fixture echoes it.
  repo.register.mockImplementation(async (input: { id: string }) => ({ ...row, id: input.id, storage_path: `${authorId}/${profileId}/${input.id}` }));
  repo.finish.mockImplementation(async (id: string) => ({ ...ready, id }));
  repo.fail.mockImplementation(async (id: string) => ({ ...row, id, status: "failed", error_code: "storage_error" }));
  storage.upload.mockResolvedValue({ error: null }); supabase.storage.from.mockReturnValue(storage);
});
afterEach(() => vi.unstubAllEnvs());

describe("private portrait upload", () => {
  it.each([null, "https://elsewhere.test"])("blocks a cross-origin upload from %s before touching private data", async site => {
    expect((await uploadPortrait(upload({ site }))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("refuses a viewer, a missing permission confirmation, and an unsupported file before storing anything", async () => {
    vi.mocked(getWorkspaceRole).mockResolvedValueOnce("viewer");
    expect((await uploadPortrait(upload())).status).toBe(403);
    expect((await uploadPortrait(upload({ permission: false }))).status).toBe(400);
    expect((await uploadPortrait(upload({ name: "notes.txt", type: "text/plain" }))).status).toBe(400);
    expect((await uploadPortrait(upload({ name: "celine.png", type: "image/jpeg" }))).status).toBe(400);
    expect(repo.register).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("requires a recorded source before an image may be marked approved for promotion", async () => {
    expect((await uploadPortrait(upload({ usage: "promotional_approved" }))).status).toBe(400);
    expect(repo.register).not.toHaveBeenCalled();
    const allowed = await uploadPortrait(upload({ usage: "promotional_approved", credit: "Commissioned from a named illustrator" }));
    expect(allowed.status).toBe(201);
    expect(repo.register).toHaveBeenCalledWith(expect.objectContaining({ usagePermission: "promotional_approved", sourceCredit: "Commissioned from a named illustrator" }));
  });

  it("stores only sanitized bytes and records the removal before marking the image stored", async () => {
    const response = await uploadPortrait(upload());
    expect(response.status).toBe(201);
    expect(supabase.storage.from).toHaveBeenCalledWith("kira-character-portraits");
    const stored = uploadedBytes();
    expect(stored.toString("latin1")).not.toContain(gps);
    expect(createHash("sha256").update(stored).digest("hex")).toBe(cleanHash);
    expect(repo.register).toHaveBeenCalledWith(expect.objectContaining({ hash: cleanHash, bytes: stored.length, mime: "image/png" }));
    expect(repo.finish).toHaveBeenCalledWith(registeredId(), 800, 1000);
    // Sanitizing and registering both precede any upload, and storing precedes the claim.
    expect(repo.register.mock.invocationCallOrder[0]).toBeLessThan(storage.upload.mock.invocationCallOrder[0]);
    expect(storage.upload.mock.invocationCallOrder[0]).toBeLessThan(repo.finish.mock.invocationCallOrder[0]);
    const payload = await response.json();
    expect(payload.removed).toContain("exif");
    expect(payload.portrait).toMatchObject({ status: "ready", location_metadata_removed: true, width: 800, height: 1000 });
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects an image it cannot clean without registering or storing it", async () => {
    const response = await uploadPortrait(upload({ body: Buffer.from("not really a png", "latin1") }));
    expect(response.status).toBe(422);
    expect(repo.register).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("returns an identical already-stored portrait without uploading again", async () => {
    repo.register.mockResolvedValueOnce({ ...ready, id: randomUUID() });
    const response = await uploadPortrait(upload());
    expect(response.status).toBe(200);
    expect((await response.json()).duplicate).toBe(true);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("never claims an image is stored when the stored bytes do not match", async () => {
    storage.upload.mockResolvedValue({ error: { message: "conflict" } });
    storage.download.mockResolvedValue({ data: new Blob(["tampered"]), error: null });
    expect((await uploadPortrait(upload())).status).toBe(503);
    expect(repo.fail).toHaveBeenCalledWith(registeredId(), "storage_error");
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("recovers a lost upload response only after verifying the stored bytes", async () => {
    storage.upload.mockResolvedValue({ error: { message: "conflict" } });
    storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(clean.bytes)]), error: null });
    expect((await uploadPortrait(upload())).status).toBe(201);
    expect(repo.finish).toHaveBeenCalledWith(registeredId(), 800, 1000);
    expect(repo.fail).not.toHaveBeenCalled();
  });

  it("refuses an unknown form field", async () => {
    const form = new FormData();
    form.set("profileId", profileId); form.set("permission", "true");
    form.set("file", new File([new Uint8Array(pngWithExif())], "celine.png", { type: "image/png" }));
    form.set("makePublic", "true");
    const response = await uploadPortrait(new Request(`${origin}/api/characters/portraits`, { method: "POST", headers: { origin }, body: form }));
    expect(response.status).toBe(400);
    expect(repo.register).not.toHaveBeenCalled();
  });
});
