import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/connections/repository", async (original) => ({ ...(await original<typeof import("@/lib/connections/repository")>()), createConnectionRepository: vi.fn() }));
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { createConnectionRepository } from "@/lib/connections/repository";
import { GET, POST, DELETE } from "@/app/api/connections/route";
const authorId = "20000000-0000-4000-8000-000000000001";
const id = "30000000-0000-4000-8000-000000000001";
const supabase = {} as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"];
const repo = { load: vi.fn(), add: vi.fn(), remove: vi.fn() };
const input = { platform: "instagram", label: "My profile", url: "https://instagram.com/author?igsh=tracking" };
function request(method: string, body: unknown, origin: string | null = "https://kira.example") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("Origin", origin);
  return new Request("https://kira.example/api/connections", { method, headers, body: JSON.stringify(body) });
}
describe("Connections API authority", () => {
  beforeEach(() => {
    vi.stubEnv("KIRA_WORKSPACE_MODE", "connected");
    vi.mocked(requireWorkspaceSession).mockResolvedValue({ mode: "connected", configured: true, authorization: "authorized", authorId, supabase, user: { id, email: "owner@example.test" } });
    vi.mocked(createConnectionRepository).mockReturnValue(repo);
    Object.values(repo).forEach(method => method.mockResolvedValue([]));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("uses the verified session tenant and private cache headers", async () => {
    for (const response of [await GET(), await POST(request("POST", input)), await DELETE(request("DELETE", { id }))]) {
      expect(response.status).toBeLessThan(300);
      expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    }
    expect(createConnectionRepository).toHaveBeenCalledWith(supabase, authorId);
    expect(repo.add).toHaveBeenCalledWith({ ...input, url: "https://www.instagram.com/author" });
    expect(repo.remove).toHaveBeenCalledWith(id);
  });
  it.each([null, "https://evil.example"])("rejects mutation origin %s before verifying access", async origin => {
    expect((await POST(request("POST", input, origin))).status).toBe(403);
    expect((await DELETE(request("DELETE", { id }, origin))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled();
  });
  it("rejects unverified sessions and never reads their links", async () => {
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(401, "unauthenticated", "Sign in."));
    expect((await GET()).status).toBe(401);
    expect((await POST(request("POST", input))).status).toBe(401);
    expect(createConnectionRepository).not.toHaveBeenCalled();
  });
  it("rejects tenant spoofing, token fields, unsafe URLs and oversized request streams", async () => {
    for (const body of [{ ...input, author_id: authorId }, { ...input, access_token: "private" }, { ...input, url: "https://evil.example/profile" }, { ...input, label: "😀".repeat(4000) }])
      expect((await POST(request("POST", body))).status).toBe(400);
    expect(repo.add).not.toHaveBeenCalled();
  });
  it("never echoes unexpected private database details", async () => {
    repo.load.mockRejectedValue(new Error("Private server information"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Private server information");
  });
});
