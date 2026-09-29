import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { GET } from "@/app/api/workspace/resume/route";
import { resumeReadingLabel } from "@/lib/workspace-resume";

const authorId = "10000000-0000-4000-8000-000000000001";
const bookId = "20000000-0000-4000-8000-000000000001";
const manuscriptId = "30000000-0000-4000-8000-000000000001";
const answerId = "40000000-0000-4000-8000-000000000001";
const date = "2026-09-26T10:00:00Z";
const records: Record<string, unknown> = {
  books: [{ id: bookId, slug: "a-book", title: "A book", updated_at: date, active_manuscript_id: manuscriptId, overview: "PRIVATE BODY" }],
  workspace_generations: { id: answerId, title: "An answer", completed_at: date, created_at: date, prompt: "PRIVATE QUESTION", result: { summary: "PRIVATE ANSWER" } },
  manuscripts: { id: manuscriptId, version: 2, status: "processing", completed_chunks: 3, chunk_count: 8, reference_text: "PRIVATE MANUSCRIPT" },
  manuscript_reading_jobs: { state: "paused" },
  character_profiles: [],
};
type Call = { table: string; operation: string; args: unknown[] };
let calls: Call[] = [];
let failedTable = "";
const from = vi.fn((table: string) => {
  const result = { data: records[table], error: table === failedTable ? { code: "secret", message: "PRIVATE ERROR" } : null };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const operation of ["select", "eq", "neq", "not", "order", "limit", "maybeSingle"]) builder[operation] = (...args: unknown[]) => { calls.push({ table, operation, args }); return builder; };
  return builder;
});
const session = { mode: "connected" as const, configured: true as const, authorization: "authorized" as const, authorId, user: { id: authorId, email: "owner@example.test" }, supabase: { from } as unknown as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"] };

describe("private home resume summary", () => {
  beforeEach(() => {
    calls = []; failedTable = "";
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session);
    vi.mocked(getWorkspaceRole).mockResolvedValue("viewer");
  });
  afterEach(() => vi.clearAllMocks());
  it("returns only bounded summary fields and scopes every query to the verified author", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    const body = await response.json();
    expect(body.books[0].reading).toEqual({ id: manuscriptId, version: 2, status: "processing", completed_chunks: 3, chunk_count: 8, job_state: "paused" });
    expect(body.answer).toEqual({ id: answerId, title: "An answer", completed_at: date, created_at: date });
    expect(body.showcase).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("PRIVATE");
    expect(getWorkspaceRole).toHaveBeenCalledWith(session);
    for (const table of Object.keys(records)) expect(calls).toContainEqual({ table, operation: "eq", args: ["author_id", authorId] });
    expect(calls).toContainEqual({ table: "books", operation: "limit", args: [2] });
    expect(calls).toContainEqual({ table: "workspace_generations", operation: "eq", args: ["status", "complete"] });
    expect(calls).toContainEqual({ table: "workspace_generations", operation: "select", args: ["id,title:result->>title,created_at,completed_at"] });
  });
  it("fails closed before reading summaries when session or workspace membership is lost", async () => {
    vi.mocked(requireWorkspaceSession).mockRejectedValueOnce(new WorkspaceAccessError(401, "unauthenticated", "Sign in."));
    expect((await GET()).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    vi.mocked(getWorkspaceRole).mockRejectedValueOnce(new WorkspaceAccessError(403, "forbidden", "Access ended."));
    expect((await GET()).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("reports temporary failures without exposing a partial summary or database detail", async () => {
    failedTable = "manuscript_reading_jobs";
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Your saved work could not be loaded. Please try again." });
  });
  it("distinguishes saved reading progress from active or paused work", () => {
    const reading = { id: manuscriptId, version: 2, status: "processing" as const, completed_chunks: 3, chunk_count: 8, job_state: null };
    expect(resumeReadingLabel(reading)).toBe("Check reading progress");
    expect(resumeReadingLabel({ ...reading, job_state: "paused" })).toBe("Reading paused");
    expect(resumeReadingLabel({ ...reading, job_state: "running" })).toBe("Reading in the background");
    expect(resumeReadingLabel({ ...reading, status: "ready", job_state: "complete" })).toBe("Knowledge ready");
  });
});
