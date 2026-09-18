import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/connections/meta-repository", async original => ({ ...(await original<typeof import("@/lib/connections/meta-repository")>()), createMetaRepository: vi.fn(), loadMetaView: vi.fn() }));
vi.mock("@/lib/connections/meta-provider", async original => ({ ...(await original<typeof import("@/lib/connections/meta-provider")>()), exchangeMetaCode: vi.fn(), verifyMetaToken: vi.fn(), revokeMetaToken: vi.fn() }));
import { requireWorkspaceSession } from "@/lib/auth/session";
import { createMetaRepository, loadMetaView, MetaAccessError } from "@/lib/connections/meta-repository";
import { exchangeMetaCode, verifyMetaToken, revokeMetaToken, MetaProviderError } from "@/lib/connections/meta-provider";
import { newOAuthState, stateHash } from "@/lib/connections/meta-crypto";
import { POST as start } from "@/app/api/connections/meta/start/route";
import { GET as callback } from "@/app/api/connections/meta/callback/route";
import { GET, POST, DELETE } from "@/app/api/connections/meta/route";
const authorId = "20000000-0000-4000-8000-000000000001", userId = "10000000-0000-4000-8000-000000000001";
const repo = { ready: vi.fn(), begin: vi.fn(), consume: vi.fn(), save: vi.fn(), credential: vi.fn(), remove: vi.fn() };
const verified = { metaUserId: "123", userToken: "private-token", accounts: [], scopes: [], expiresAt: new Date(Date.now() + 3600000).toISOString() };
function request(method: string, origin = "https://kira.example") { return new Request("https://kira.example/api/connections/meta", { method, headers: { Origin: origin } }); }
function callbackRequest(state: string, cookie = state, tail = "code=private-code") {
  return new NextRequest(`https://kira.example/api/connections/meta/callback?state=${state}&${tail}`, { headers: { Cookie: `kira_meta_oauth=${cookie}` } });
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://kira.example"); vi.stubEnv("KIRA_WORKSPACE_MODE", "connected");
  vi.stubEnv("KIRA_META_APP_ID", "123456"); vi.stubEnv("KIRA_META_APP_SECRET", "a".repeat(32)); vi.stubEnv("KIRA_META_LOGIN_CONFIG_ID", "654321");
  vi.stubEnv("KIRA_META_GRAPH_VERSION", "v26.0"); vi.stubEnv("KIRA_META_CREDENTIAL_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.mocked(requireWorkspaceSession).mockResolvedValue({ mode: "connected", configured: true, authorization: "authorized", authorId, user: { id: userId, email: "owner@example.test" }, supabase: {} as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"] });
  vi.mocked(createMetaRepository).mockReturnValue(repo);
  Object.values(repo).forEach(method => method.mockReset()); repo.ready.mockResolvedValue(true);
  repo.credential.mockResolvedValue({ userToken: "private-token", expectedCiphertext: "encrypted-version" });
  vi.mocked(exchangeMetaCode).mockResolvedValue(verified); vi.mocked(verifyMetaToken).mockResolvedValue(verified);
  vi.mocked(loadMetaView).mockResolvedValue({ configured: true, isOwner: true, connection: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Meta OAuth HTTP boundary", () => {
  it("sets a secure state cookie and sends only a public app/config ID and nonce to Meta", async () => {
    const response = await start(request("POST"));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("www.facebook.com"); expect(location.searchParams.get("redirect_uri")).toBe("https://kira.example/api/connections/meta/callback");
    expect(repo.begin).toHaveBeenCalledWith(stateHash(location.searchParams.get("state")!));
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/); expect(response.headers.get("set-cookie")).toMatch(/Secure/);
    expect(location.href).not.toContain("private-token"); expect(location.searchParams.has("client_secret")).toBe(false);
  });
  it("does not begin OAuth when configuration/capability is missing or origin is hostile", async () => {
    expect((await start(request("POST", "https://evil.example"))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled();
    vi.stubEnv("KIRA_META_APP_SECRET", ""); expect((await start(request("POST"))).status).toBe(503);
    expect(repo.begin).not.toHaveBeenCalled();
  });
  it("consumes matching session state before exchanging and saves only verified authorization", async () => {
    const state = newOAuthState(); const response = await callback(callbackRequest(state));
    expect(repo.consume).toHaveBeenCalledWith(stateHash(state));
    expect(repo.consume.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(exchangeMetaCode).mock.invocationCallOrder[0]);
    expect(repo.save).toHaveBeenCalledWith(verified, { stateHash: stateHash(state) });
    expect(response.headers.get("location")).toBe("https://kira.example/connections?meta=authorized");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toMatch(/private-token|private-code/);
  });
  it("rejects missing/mismatched/replayed state and never exchanges a code", async () => {
    const state = newOAuthState();
    await callback(callbackRequest(state, newOAuthState())); expect(repo.consume).not.toHaveBeenCalled();
    repo.consume.mockRejectedValue(new MetaAccessError("invalid_state"));
    await callback(callbackRequest(state));
    expect(exchangeMetaCode).not.toHaveBeenCalled(); expect(repo.save).not.toHaveBeenCalled();
  });
  it("cancelled or failed provider verification never marks a connection authorized", async () => {
    const state = newOAuthState();
    expect((await callback(callbackRequest(state, state, "error=access_denied"))).headers.get("location")).toContain("meta=cancelled");
    vi.mocked(exchangeMetaCode).mockRejectedValue(new Error("private-code private-token"));
    const result = await callback(callbackRequest(state));
    expect(result.headers.get("location")).toContain("meta=failed"); expect(repo.save).not.toHaveBeenCalled();
    expect(await result.text()).not.toContain("private-token");
  });
  it("returns public status without credentials and marks a revoked current credential for reconnect", async () => {
    expect(await (await GET()).json()).toEqual({ configured: true, isOwner: true, connection: null });
    expect(repo.credential).not.toHaveBeenCalled();
    vi.mocked(verifyMetaToken).mockRejectedValue(new MetaProviderError("reconnect"));
    expect((await POST(request("POST"))).status).toBe(409);
    expect(repo.remove).toHaveBeenCalledWith(false, "encrypted-version"); expect(repo.save).not.toHaveBeenCalled();
  });
  it("blocks unauthorized credential access and still removes local credentials if remote revocation fails", async () => {
    repo.credential.mockRejectedValueOnce(new MetaAccessError("owner_required"));
    expect((await DELETE(request("DELETE"))).status).toBe(403); expect(revokeMetaToken).not.toHaveBeenCalled();
    vi.mocked(revokeMetaToken).mockRejectedValue(new MetaProviderError("provider_unavailable"));
    const result = await DELETE(request("DELETE"));
    expect(await result.json()).toEqual({ disconnected: true, providerRevoked: false }); expect(repo.remove).toHaveBeenCalledWith(true);
  });
});
