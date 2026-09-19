import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ runStudioProvider: vi.fn() }));
vi.mock("@/lib/ai/studio-provider", async (original) => ({ ...(await original<typeof import("@/lib/ai/studio-provider")>()), getStudioAvailability: vi.fn() }));
vi.mock("@/lib/db/studio-repository", async (original) => ({ ...(await original<typeof import("@/lib/db/studio-repository")>()), createStudioRepository: vi.fn() }));
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { runStudioProvider } from "@/lib/ai/provider";
import { getStudioAvailability, StudioProviderError } from "@/lib/ai/studio-provider";
import { createStudioRepository, StudioRepositoryError } from "@/lib/db/studio-repository";
import { STUDIO_MODEL, studioUsage, type StudioGeneration } from "@/lib/ai/studio-contract";
import { GET, POST } from "@/app/api/studio/route";

const id = "10000000-0000-4000-8000-000000000001", authorId = "20000000-0000-4000-8000-000000000001";
const input = { id, job: "brainstorm", prompt: "Help me compare a few useful book business ideas." };
const pending: StudioGeneration = { knowledge_context:{book_ids:[],include_spoilers:false,evidence:[]}, id, author_id: authorId, created_by: id, job: "brainstorm", prompt: input.prompt, model: STUDIO_MODEL, status: "pending", result: null, input_tokens: null, output_tokens: null, estimated_cost_usd: null, gateway_generation_id: null, error_code: null, created_at: "2026-09-17T00:00:00Z", completed_at: null };
const reply = { result: { kind: "ideas" as const, title: "One small idea", summary: "Something to consider.", options: [{ title: "Listen", idea: "Review comments.", tradeoff: "Small sample.", first_step: "Choose a few.", verify: [] }], questions: [], context_used: [] }, usage: studioUsage(100, 50) };
const complete: StudioGeneration = { ...pending, status: "complete", result: reply.result, completed_at: "2026-09-17T00:00:10Z" };
const repo = { list: vi.fn(), find: vi.fn(), begin: vi.fn(), complete: vi.fn(), fail: vi.fn() };
const session = { mode: "connected" as const, configured: true as const, authorization: "authorized" as const, user: { id, email: "member@example.test" }, authorId, supabase: {} as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"] };
function request(body: unknown = input, origin: string | null = "https://kira.example") {
  const headers = new Headers({ "Content-Type": "application/json" }); if (origin) headers.set("origin", origin);
  return new Request("https://kira.example/api/studio", { method: "POST", headers, body: JSON.stringify(body) });
}
describe("Ask Raven API boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://kira.example");
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session);
    vi.mocked(getWorkspaceRole).mockResolvedValue("owner");
    vi.mocked(getStudioAvailability).mockResolvedValue({ available: true, reason: "ready", message: "Ready." });
    vi.mocked(createStudioRepository).mockReturnValue(repo);
    repo.list.mockResolvedValue([pending]); repo.find.mockResolvedValue(pending); repo.begin.mockResolvedValue({ created: true, generation: pending });
    repo.complete.mockResolvedValue(complete); repo.fail.mockResolvedValue({ ...pending, status: "failed", error_code: "timeout" });
    vi.mocked(runStudioProvider).mockResolvedValue(reply);
  });
  afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
  it("loads only session-scoped history with private headers and validates addressable IDs", async () => {
    const response = await GET(new Request(`https://kira.example/api/studio?id=${id}`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(createStudioRepository).toHaveBeenCalledWith(session.supabase, authorId); expect(repo.find).toHaveBeenCalledWith(id);
    expect((await GET(new Request("https://kira.example/api/studio?id=invalid"))).status).toBe(400);
    repo.find.mockResolvedValueOnce(null);
    expect((await GET(new Request(`https://kira.example/api/studio?id=${id}`))).status).toBe(404);
  });
  it.each([null, "https://evil.example"])("rejects origin %s before authentication or AI work", async (origin) => {
    expect((await POST(request(input, origin))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled(); expect(runStudioProvider).not.toHaveBeenCalled();
  });
  it("fails closed for anonymous callers and denies viewer spending", async () => {
    vi.mocked(requireWorkspaceSession).mockRejectedValueOnce(new WorkspaceAccessError(401, "unauthenticated", "Sign in."));
    expect((await POST(request())).status).toBe(401);
    vi.mocked(getWorkspaceRole).mockResolvedValue("viewer");
    expect((await POST(request())).status).toBe(403);
    expect(getStudioAvailability).not.toHaveBeenCalled(); expect(repo.begin).not.toHaveBeenCalled(); expect(runStudioProvider).not.toHaveBeenCalled();
  });
  it.each([{ ...input, job: "fiction" }, { ...input, prompt: "short" }, { ...input, prompt: "x".repeat(6001) }, { ...input, author_id: "other" }, { ...input, model: "expensive-model" }, { ...input, id: "invalid" }])("rejects unsafe request fields before any paid call", async (body) => {
    expect((await POST(request(body))).status).toBe(400); expect(repo.begin).not.toHaveBeenCalled(); expect(runStudioProvider).not.toHaveBeenCalled();
  });
  it("caps the actual body stream and blocks explicit fiction without a model call", async () => {
    const oversized = request({ ...input, prompt: "x".repeat(40000) }); oversized.headers.set("content-length", "2");
    expect((await POST(oversized)).status).toBe(413);
    expect((await POST(request({ ...input, prompt: "Please write a new scene for my novel." }))).status).toBe(422);
    expect(runStudioProvider).not.toHaveBeenCalled();
  });
  it("does not create a generation when funding or configuration is unavailable", async () => {
    vi.mocked(getStudioAvailability).mockResolvedValue({ available: false, reason: "funding", message: "Credits required." });
    expect((await POST(request())).status).toBe(503); expect(repo.begin).not.toHaveBeenCalled(); expect(runStudioProvider).not.toHaveBeenCalled();
  });
  it("saves pending before generating and returns an answer only after persistence", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201); expect((await response.json()).generation).toEqual(complete);
    expect(repo.begin.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runStudioProvider).mock.invocationCallOrder[0]);
    expect(vi.mocked(runStudioProvider).mock.invocationCallOrder[0]).toBeLessThan(repo.complete.mock.invocationCallOrder[0]);
    expect(repo.complete).toHaveBeenCalledWith(id, reply);
  });
  it.each([pending, complete])("reuses an existing ID without a second provider call", async (generation) => {
    repo.begin.mockResolvedValue({ created: false, generation });
    const response = await POST(request()); expect(response.status).toBe(generation.status === "pending" ? 202 : 200);
    expect(runStudioProvider).not.toHaveBeenCalled(); expect(repo.complete).not.toHaveBeenCalled();
  });
  it.each([["54000", 429], ["55P03", 409], ["40001", 409], ["42501", 403]] as const)("preserves database budget and authorization failure %s", async (code, status) => {
    repo.begin.mockRejectedValue(new StudioRepositoryError(code));
    expect((await POST(request())).status).toBe(status); expect(runStudioProvider).not.toHaveBeenCalled();
  });
  it("records classified provider failure, never raw exception messages or an offline fallback", async () => {
    vi.mocked(runStudioProvider).mockRejectedValue(new StudioProviderError("timeout", studioUsage(42, undefined)));
    expect((await POST(request())).status).toBe(201);
    expect(repo.fail).toHaveBeenCalledWith(id, "timeout", studioUsage(42, undefined)); expect(repo.complete).not.toHaveBeenCalled();
  });
  it("never reruns a paid generation when final persistence fails", async () => {
    repo.complete.mockRejectedValue(new Error("private database detail"));
    const response = await POST(request()); expect(response.status).toBe(503);
    const body = await response.json(); expect(body.requestId).toBe(id);
    expect(JSON.stringify(body)).not.toContain("private database"); expect(runStudioProvider).toHaveBeenCalledOnce(); expect(repo.fail).not.toHaveBeenCalled();
    expect(repo.complete).toHaveBeenCalledTimes(2);
  });
  it("retries only the idempotent save after a transient persistence failure", async () => {
    repo.complete.mockRejectedValueOnce(new StudioRepositoryError("unavailable"));
    expect((await POST(request())).status).toBe(201);
    expect(repo.complete).toHaveBeenCalledTimes(2); expect(runStudioProvider).toHaveBeenCalledOnce();
  });
  it("retries a failure record without losing its classified reason or known usage", async () => {
    const usage = studioUsage(42, 10);
    vi.mocked(runStudioProvider).mockRejectedValue(new StudioProviderError("invalid_output", usage));
    repo.fail.mockRejectedValueOnce(new StudioRepositoryError("unavailable"));
    expect((await POST(request())).status).toBe(201);
    expect(repo.fail).toHaveBeenNthCalledWith(1, id, "invalid_output", usage);
    expect(repo.fail).toHaveBeenNthCalledWith(2, id, "invalid_output", usage);
    expect(runStudioProvider).toHaveBeenCalledOnce(); expect(repo.complete).not.toHaveBeenCalled();
  });
  it("bounds failed-outcome persistence retries and preserves the recovery ID", async () => {
    vi.mocked(runStudioProvider).mockRejectedValue(new StudioProviderError("timeout"));
    repo.fail.mockRejectedValue(new StudioRepositoryError("unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503); expect((await response.json()).requestId).toBe(id);
    expect(repo.fail).toHaveBeenCalledTimes(2); expect(runStudioProvider).toHaveBeenCalledOnce();
    expect(repo.complete).not.toHaveBeenCalled();
  });
});
