import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
vi.mock("@/lib/workspace-export/archive", async original => ({ ...(await original<typeof import("@/lib/workspace-export/archive")>()), buildWorkspaceArchive: vi.fn() }));
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { buildWorkspaceArchive, WorkspaceExportError } from "@/lib/workspace-export/archive";
import { GET } from "@/app/api/workspace/export/route";
const session = { authorId: "10000000-0000-4000-8000-000000000001", supabase: {} } as Awaited<ReturnType<typeof requireWorkspaceSession>>;
const request = () => new Request("https://kira.example/api/workspace/export");
afterEach(() => vi.resetAllMocks());
describe("workspace archive API", () => {
  it.each(["editor", "viewer"] as const)("denies %s before collecting data", async role => {
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session); vi.mocked(getWorkspaceRole).mockResolvedValue(role);
    expect((await GET(request())).status).toBe(403); expect(buildWorkspaceArchive).not.toHaveBeenCalled();
  });
  it("rejects anonymous callers before collecting data", async () => {
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(401, "unauthenticated", "Sign in."));
    expect((await GET(request())).status).toBe(401); expect(buildWorkspaceArchive).not.toHaveBeenCalled();
  });
  it("streams only a completed owner archive with private headers and checksum", async () => {
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session); vi.mocked(getWorkspaceRole).mockResolvedValue("owner");
    const bytes = new Uint8Array(5 * 1024 * 1024);
    vi.mocked(buildWorkspaceArchive).mockResolvedValue({ bytes, sha256: "a".repeat(64), filename: "kira-workspace-2026-09-26.zip", unavailableFiles: 0 });
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(response.headers.has("content-length")).toBe(false); expect(response.headers.get("X-Kira-Archive-Bytes")).toBe(String(bytes.length));
    expect(getWorkspaceRole).toHaveBeenCalledTimes(2);
    const reader = response.body!.getReader(); let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; expect(part.value.length).toBeLessThanOrEqual(65536); size += part.value.length; }
    expect(size).toBe(bytes.length);
  });
  it("refuses a revoked owner or incomplete archive before starting the response", async () => {
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session);
    vi.mocked(getWorkspaceRole).mockResolvedValueOnce("owner").mockResolvedValueOnce("viewer");
    vi.mocked(buildWorkspaceArchive).mockResolvedValue({ bytes: new Uint8Array([1]), sha256: "a".repeat(64), filename: "archive.zip", unavailableFiles: 0 });
    expect((await GET(request())).status).toBe(403);
    vi.mocked(getWorkspaceRole).mockResolvedValue("owner");
    vi.mocked(buildWorkspaceArchive).mockRejectedValue(new WorkspaceExportError("limit"));
    expect((await GET(request())).status).toBe(413);
  });
});
