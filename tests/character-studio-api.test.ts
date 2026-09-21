import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
vi.mock("@/lib/characters/repository", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/characters/repository")>(), createCharacterRepository: vi.fn() }));
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { createCharacterRepository } from "@/lib/characters/repository";
import { characterGallerySchema, characterProfileDetailSchema } from "@/lib/characters/contract";
import { GET as listCharacters, POST as createCharacter } from "@/app/api/characters/route";
import { GET as readCharacter, PATCH as editCharacter } from "@/app/api/characters/[id]/route";

const authorId = randomUUID(), userId = randomUUID(), profileId = randomUUID(), portraitId = randomUUID(), bookId = randomUUID(), characterId = randomUUID();
const origin = "https://kira.test";
const cover = { id: portraitId, caption: "Reference board", source_credit: null, usage_permission: "private_reference_only" as const, width: 800, height: 1000, created_at: new Date().toISOString(), url: "https://storage.test/signed?token=short-lived" };
const profile = { id: profileId, display_name: "Celine", summary: null, universe_id: null, primary_portrait_id: portraitId, version: 2, updated_at: new Date().toISOString(), aliases: ["The Lark"], portrait_count: 1, book_count: 1, cover };
const detail = {
  profile, portraits: [cover],
  notes: [{ id: randomUUID(), kind: "author_confirmed" as const, body: "She never lies about the harbour.", book_id: bookId, version: 1, created_at: new Date().toISOString() }],
  links: [{ id: randomUUID(), book_id: bookId, character_id: characterId, note: null, confirmed_at: new Date().toISOString(), book_title: "The Quiet Library", character_name: "Celine" }],
};
const repo = { listProfiles: vi.fn(), profileDetail: vi.fn(), createProfile: vi.fn(), updateProfile: vi.fn(), findProfile: vi.fn() };
const supabase = { storage: { from: vi.fn() } };
const context = { params: Promise.resolve({ id: profileId }) };
function get(path: string, site: string | null = origin) {
  return new Request(`${origin}${path}`, { headers: { ...(site ? { origin: site } : {}) } });
}
function send(path: string, body: unknown, method = "POST", site: string | null = origin) {
  return new Request(`${origin}${path}`, { method, headers: { "Content-Type": "application/json", ...(site ? { origin: site } : {}) }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.mocked(requireWorkspaceSession).mockResolvedValue({ mode: "connected", configured: true, authorization: "authorized", authorId, user: { id: userId, email: "fixture@example.test" }, supabase: supabase as unknown as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"] });
  vi.mocked(getWorkspaceRole).mockResolvedValue("editor");
  vi.mocked(createCharacterRepository).mockReturnValue(repo as unknown as ReturnType<typeof createCharacterRepository>);
  repo.listProfiles.mockResolvedValue([profile]); repo.profileDetail.mockResolvedValue(detail);
  repo.createProfile.mockResolvedValue({ id: profileId, display_name: "Celine", normalized_name: "celine", universe_id: null, summary: null, primary_portrait_id: null, version: 1, updated_at: new Date().toISOString() });
  repo.updateProfile.mockResolvedValue({ ...profile, version: 3 });
});
afterEach(() => vi.unstubAllEnvs());

describe("Character Studio gallery API", () => {
  it.each([null, "https://elsewhere.test"])("refuses a cross-origin write from %s before touching private data", async site => {
    expect((await createCharacter(send("/api/characters", { displayName: "Celine" }, "POST", site))).status).toBe(403);
    expect((await editCharacter(send(`/api/characters/${profileId}`, { expectedVersion: 2, displayName: "X" }, "PATCH", site), context)).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled();
    expect(repo.createProfile).not.toHaveBeenCalled();
  });

  it("serves a read without an Origin header, because a browser omits one on a same-origin GET", async () => {
    // An origin-gated read would reject the app's own fetch; the session and RLS are the boundary.
    expect((await listCharacters()).status).toBe(200);
    expect((await readCharacter(new Request(`${origin}/api/characters/${profileId}`), context)).status).toBe(200);
  });

  it("returns the gallery in the client's own shape, with signed URLs and no storage paths", async () => {
    const response = await listCharacters();
    expect(response.status).toBe(200);
    const payload: unknown = await response.json();
    const parsed = characterGallerySchema.parse(payload);
    expect(parsed.profiles[0]).toMatchObject({ display_name: "Celine", aliases: ["The Lark"], portrait_count: 1, book_count: 1 });
    expect(parsed.profiles[0].cover?.url).toContain("signed");
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a profile with its portraits, notes and confirmed book links", async () => {
    const response = await readCharacter(get(`/api/characters/${profileId}`), context);
    expect(response.status).toBe(200);
    const parsed = characterProfileDetailSchema.parse(await response.json());
    expect(parsed.notes[0].kind).toBe("author_confirmed");
    expect(parsed.links[0]).toMatchObject({ book_title: "The Quiet Library", character_name: "Celine" });
    expect(repo.profileDetail).toHaveBeenCalledWith(profileId);
  });

  it("rejects a profile identifier that is not a UUID before querying", async () => {
    const response = await readCharacter(get("/api/characters/not-a-uuid"), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(response.status).toBe(400);
    expect(repo.profileDetail).not.toHaveBeenCalled();
  });

  it("creates a character with its aliases and refuses an empty name", async () => {
    const created = await createCharacter(send("/api/characters", { displayName: "Celine", aliases: ["The Lark"], summary: null }));
    expect(created.status).toBe(201);
    expect(repo.createProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Celine", aliases: ["The Lark"] }));
    expect((await createCharacter(send("/api/characters", { displayName: "   " }))).status).toBe(400);
    expect((await createCharacter(send("/api/characters", { displayName: "Celine", aliases: Array.from({ length: 9 }, (_, index) => `Alias ${index}`) }))).status).toBe(400);
    expect(repo.createProfile).toHaveBeenCalledOnce();
  });

  it("keeps a viewer read-only", async () => {
    vi.mocked(getWorkspaceRole).mockResolvedValue("viewer");
    expect((await listCharacters()).status).toBe(200);
    expect((await createCharacter(send("/api/characters", { displayName: "Celine" }))).status).toBe(403);
    expect((await editCharacter(send(`/api/characters/${profileId}`, { expectedVersion: 2, displayName: "Renamed" }, "PATCH"), context)).status).toBe(403);
    expect(repo.createProfile).not.toHaveBeenCalled();
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("passes the held version through so a stale edit is refused rather than overwriting", async () => {
    const response = await editCharacter(send(`/api/characters/${profileId}`, { expectedVersion: 2, primaryPortraitId: portraitId }, "PATCH"), context);
    expect(response.status).toBe(200);
    expect(repo.updateProfile).toHaveBeenCalledWith(profileId, expect.objectContaining({ primaryPortraitId: portraitId }), 2);
    expect((await editCharacter(send(`/api/characters/${profileId}`, { displayName: "Renamed" }, "PATCH"), context)).status).toBe(400);
    expect(repo.updateProfile).toHaveBeenCalledOnce();
  });
});
