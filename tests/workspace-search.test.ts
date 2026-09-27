import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/search/repository", async original => ({ ...(await original<typeof import("@/lib/search/repository")>()), searchWorkspace: vi.fn() }));
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { literalSearchPattern, searchWorkspace } from "@/lib/search/repository";
import { readStudioHistoryCursor, studioHistoryQuerySchema } from "@/lib/db/studio-repository";
import { GET } from "@/app/api/search/route";

const authorId = "20000000-0000-4000-8000-000000000001";
const session = { authorId, supabase: {}, user: { id: authorId } } as Awaited<ReturnType<typeof requireWorkspaceSession>>;
afterEach(() => vi.resetAllMocks());
describe("private workspace search", () => {
  it("requires a verified session, scopes all retrieval to it and permits read-only viewers", async () => {
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session);
    vi.mocked(searchWorkspace).mockResolvedValue([]);
    const response = await GET(new Request("https://kira.example/api/search?q=reader"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(searchWorkspace).toHaveBeenCalledWith(session.supabase, authorId, "reader");
    expect(await response.json()).toEqual({ results: [] });
  });
  it.each([401, 403] as const)("fails closed at the session boundary (%s)", async status => {
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(status, status === 401 ? "unauthenticated" : "forbidden", "Access ended."));
    expect((await GET(new Request("https://kira.example/api/search?q=reader"))).status).toBe(status);
    expect(searchWorkspace).not.toHaveBeenCalled();
  });
  it("bounds input and sanitizes database failures", async () => {
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session);
    for (const q of ["", "a", "x".repeat(201)]) expect((await GET(new Request(`https://kira.example/api/search?q=${q}`))).status).toBe(400);
    expect(searchWorkspace).not.toHaveBeenCalled();
    vi.mocked(searchWorkspace).mockRejectedValue(new Error("private database details"));
    const response = await GET(new Request("https://kira.example/api/search?q=reader"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private database details");
  });
  it("treats LIKE metacharacters literally and rejects malformed or mismatched cursors", () => {
    expect(literalSearchPattern("a%,_(b)\\c")).toBe("%a\\%,\\_(b)\\\\c%");
    const data = { createdAt: "2026-09-26T00:00:00.123456+00:00", id: authorId, query: "readers" };
    const cursor = Buffer.from(JSON.stringify(data)).toString("base64url");
    expect(readStudioHistoryCursor(cursor, "readers")).toEqual(data);
    expect(() => readStudioHistoryCursor(cursor, "different")).toThrow();
    for (const cursor of ["bad", "<sql>", Buffer.from(JSON.stringify({ ...data, id: "not a uuid" })).toString("base64url")]) expect(() => readStudioHistoryCursor(cursor, "readers")).toThrow();
    expect(studioHistoryQuerySchema.parse({})).toEqual({ query: "", limit: 25 });
  });
});
