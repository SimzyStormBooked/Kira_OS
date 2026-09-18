import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({
  WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError,
  requireWorkspaceSession: vi.fn(),
}));
vi.mock("@/lib/db/connected-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/connected-repository")>()),
  createConnectedRepository: vi.fn(),
}));
vi.mock("@/lib/ai/provider", () => ({ runProvider: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { createConnectedRepository, ConnectedRepositoryError } from "@/lib/db/connected-repository";
import { runProvider } from "@/lib/ai/provider";
import { GET, PATCH } from "@/app/api/workspace/route";
import { POST as runRaven } from "@/app/api/raven/route";

const id = "a38b640b-02b3-4a14-bacc-7d6837e53021";
const authorId = "b62c2190-e1e0-4d87-8326-f69706129641";
const workspace = { version: 1 as const, approvals: [], feedback: [], dismissed: [], recommendations: [], last_run_at: null };
const supabase = {};
const repo = {
  loadWorkspace: vi.fn(), decideApproval: vi.fn(), teachRaven: vi.fn(),
  queueRecommendation: vi.fn(), dismissRecommendation: vi.fn(),
  restoreRecommendations: vi.fn(), createManualReview: vi.fn(),
};
const access = {
  mode: "connected" as const, configured: true as const, authorization: "authorized" as const,
  user: { id: "member-id", email: "member@example.test" }, authorId,
  supabase: supabase as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"],
};
function patch(body: unknown, origin: string | null = "https://kira.example") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new Request("https://kira.example/api/workspace", {
    method: "PATCH", headers, body: JSON.stringify(body),
  });
}

describe("Private workspace API boundary", () => {
  beforeEach(() => {
    vi.stubEnv("KIRA_WORKSPACE_MODE", "connected");
    vi.mocked(requireWorkspaceSession).mockResolvedValue(access);
    vi.mocked(getWorkspaceRole).mockResolvedValue("owner");
    vi.mocked(createConnectedRepository).mockReturnValue(repo);
    Object.values(repo).forEach((method) => method.mockResolvedValue(workspace));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("returns only the authorized workspace with private, non-cacheable headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(workspace);
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(response.headers.get("x-kira-workspace-role")).toBe("owner");
    expect(createConnectedRepository).toHaveBeenCalledWith(supabase, authorId);
    expect(repo.loadWorkspace).toHaveBeenCalledOnce();
  });

  it("reports a viewer role for reads but refuses writes before repository mutation", async () => {
    vi.mocked(getWorkspaceRole).mockResolvedValue("viewer");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-kira-workspace-role")).toBe("viewer");
    expect((await PATCH(patch({ action: "create", title: "Viewer draft", draft: "No write permission" }))).status).toBe(403);
    expect(repo.createManualReview).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthenticated"], [403, "forbidden"], [503, "unconfigured"], [503, "unavailable"],
  ] as const)("preserves access failure %i/%s without reading data", async (status, code) => {
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(status, code, "Access is closed."));
    for (const response of [await GET(), await PATCH(patch({ action: "restore" }))]) {
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(createConnectedRepository).not.toHaveBeenCalled();
  });

  it.each([null, "https://evil.example", "https://other.kira.example"])("blocks mutation origin %s before any workspace operation", async (origin) => {
    expect((await PATCH(patch({ action: "restore" }, origin))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled();
    expect(createConnectedRepository).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: "decide", id, decision: { type: "approve" }, version: 2 }, "decideApproval", [id, { type: "approve" }, 2]],
    [{ action: "decide", id, decision: { type: "reject" }, version: 2 }, "decideApproval", [id, { type: "reject" }, 2]],
    [{ action: "decide", id, decision: { type: "edit", draft: "  Refined brief  " }, version: 2 }, "decideApproval", [id, { type: "edit", draft: "Refined brief" }, 2]],
    [{ action: "teach", id, text: "  Prefer this wording  " }, "teachRaven", [id, "Prefer this wording"]],
    [{ action: "queue", id }, "queueRecommendation", [id]],
    [{ action: "dismiss", id }, "dismissRecommendation", [id]],
    [{ action: "restore" }, "restoreRecommendations", []],
    [{ action: "create", title: "  Launch brief  ", draft: "  Our release plan  " }, "createManualReview", ["Launch brief", "Our release plan"]],
  ] as const)("dispatches a validated command %j inside the authorized tenant", async (command, method, args) => {
    const response = await PATCH(patch(command));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(workspace);
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(createConnectedRepository).toHaveBeenCalledWith(supabase, authorId);
    expect(repo[method]).toHaveBeenCalledExactlyOnceWith(...args);
  });

  it.each([
    { action: "restore", author_id: "another-tenant" },
    { action: "teach", id, text: "A useful lesson", user_id: "someone-else" },
    { action: "queue", id: "not-a-uuid" },
    { action: "decide", id, decision: { type: "approve", draft: "hidden-edit" }, version: 1 },
    { action: "decide", id, decision: { type: "edit", draft: " " }, version: 1 },
    { action: "decide", id, decision: { type: "approve" }, version: -1 },
    { action: "decide", id, decision: { type: "approve" }, version: 1.2 },
    { action: "decide", id, decision: { type: "approve" } },
    { action: "teach", id, text: " " },
    { action: "create", title: " ", draft: "A valid brief" },
    { action: "publish", id },
  ])("rejects invalid, extra or spoofed mutation fields %j", async (command) => {
    const response = await PATCH(patch(command));
    expect(response.status).toBe(400);
    expect(createConnectedRepository).not.toHaveBeenCalled();
  });

  it("bounds the actual body in bytes without trusting Content-Length", async () => {
    const request = patch({ action: "create", title: "Oversized", draft: "😀".repeat(17000) });
    expect(request.headers.has("content-length")).toBe(false);
    expect((await PATCH(request)).status).toBe(413);
    expect(createConnectedRepository).not.toHaveBeenCalled();
  });

  it("rejects missing and malformed JSON bodies without mutating data", async () => {
    for (const body of [undefined, "{invalid-json"]) {
      const response = await PATCH(new Request("https://kira.example/api/workspace", {
        method: "PATCH", headers: { origin: "https://kira.example" }, body,
      }));
      expect(response.status).toBe(400);
    }
    expect(createConnectedRepository).not.toHaveBeenCalled();
  });

  it.each([["40001", 409], ["42501", 403], ["P0002", 404], ["XX000", 503]] as const)("maps database failure %s to HTTP %i", async (code, status) => {
    repo.restoreRecommendations.mockRejectedValue(new ConnectedRepositoryError("Database detail", code));
    const response = await PATCH(patch({ action: "restore" }));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toContain("no-store");
    if (status === 503) expect(await response.text()).not.toContain("Database detail");
  });

  it("keeps unexpected server errors private", async () => {
    repo.loadWorkspace.mockRejectedValue(new Error("Unexpected sensitive connection details"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("connection details");
  });
});

describe("Raven connected-mode boundary", () => {
  beforeEach(() => {
    vi.stubEnv("KIRA_WORKSPACE_MODE", "connected");
    vi.mocked(requireWorkspaceSession).mockResolvedValue(access);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  const request = () => new Request("https://kira.example/api/raven", {
    method: "POST", headers: { origin: "https://kira.example" },
  });

  it("requires authentication before describing the private intelligence state", async () => {
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(401, "unauthenticated", "Sign in first."));
    expect((await runRaven(request())).status).toBe(401);
    expect(runProvider).not.toHaveBeenCalled();
  });
  it("refuses to run or return seeded intelligence in connected mode", async () => {
    const response = await runRaven(request());
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    const body = await response.json();
    expect(body).not.toHaveProperty("run");
    expect(body).not.toHaveProperty("recommendations");
    expect(runProvider).not.toHaveBeenCalled();
  });
  it("blocks cross-origin connected runs before authenticating or invoking a provider", async () => {
    expect((await runRaven(new Request("https://kira.example/api/raven", {
      method: "POST", headers: { origin: "https://evil.example" },
    }))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled();
    expect(runProvider).not.toHaveBeenCalled();
  });
});
