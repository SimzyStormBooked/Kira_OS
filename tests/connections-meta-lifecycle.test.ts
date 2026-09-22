import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ createWorkspaceSupabaseClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/ads/repository", () => ({ adsWorker: vi.fn() }));
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { adsWorker } from "@/lib/ads/repository";
import { POST as deauthorize } from "@/app/api/connections/meta/deauthorize/route";
import { POST as deleteData, GET as deletionReceipt } from "@/app/api/connections/meta/deletion/route";

const appSecret = "a".repeat(32), credentialKey = Buffer.alloc(32, 7);
const serverProof = createHmac("sha256", credentialKey).update("KIRA_META_SERVER_CAPABILITY_V1").digest("hex");
function signedRequest(secret = appSecret) {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "123" })).toString("base64url");
  return `${createHmac("sha256", secret).update(payload).digest("base64url")}.${payload}`;
}
function request(signed = signedRequest()) {
  return new Request("https://kira.example/api/connections/meta/deauthorize", {
    method: "POST", body: new URLSearchParams({ signed_request: signed }),
  });
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://kira.example");
  vi.stubEnv("KIRA_META_APP_ID", "123456"); vi.stubEnv("KIRA_META_APP_SECRET", appSecret);
  vi.stubEnv("KIRA_META_GRAPH_VERSION", "v26.0"); vi.stubEnv("KIRA_META_CREDENTIAL_KEY", credentialKey.toString("base64"));
  vi.stubEnv("KIRA_META_LOGIN_CONFIG_ID", ""); vi.stubEnv("KIRA_META_ADS_LOGIN_CONFIG_ID", "765432");
  rpc.mockReset(); rpc.mockResolvedValue({ error: null });
  vi.mocked(adsWorker).mockReset(); vi.mocked(adsWorker).mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe.each(["Ads only", "organic only"])("Meta lifecycle callbacks with %s configured", connector => {
  beforeEach(() => {
    if (connector === "organic only") {
      vi.stubEnv("KIRA_META_LOGIN_CONFIG_ID", "654321"); vi.stubEnv("KIRA_META_ADS_LOGIN_CONFIG_ID", "");
    }
  });
  it("honors signed deauthorization for both stores using the existing server capability", async () => {
    const response = await deauthorize(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("revoke_meta_identity", { p_server_proof: serverProof, p_meta_user_id: "123", p_delete_data: false });
    expect(adsWorker).toHaveBeenCalledWith("revoke", null, null, { metaUserId: "123" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("honors signed deletion and verifies the returned receipt without exposing credentials", async () => {
    const response = await deleteData(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(rpc).toHaveBeenCalledWith("revoke_meta_identity", { p_server_proof: serverProof, p_meta_user_id: "123", p_delete_data: true });
    expect(adsWorker).toHaveBeenCalledWith("revoke", null, null, { metaUserId: "123" });
    expect(body.url).toBe(`https://kira.example/api/connections/meta/deletion?code=${body.confirmation_code}`);
    expect(JSON.stringify(body)).not.toContain(serverProof); expect(JSON.stringify(body)).not.toContain(appSecret);
    const receipt = await deletionReceipt(new Request(body.url));
    expect(receipt.status).toBe(200); expect(await receipt.json()).toMatchObject({ status: "completed" });
    const altered = new URL(body.url);
    const code = body.confirmation_code as string;
    altered.searchParams.set("code", `${code.startsWith("a") ? "b" : "a"}${code.slice(1)}`);
    expect((await deletionReceipt(new Request(altered))).status).toBe(404);
  });
});

describe.each([deauthorize, deleteData])("Meta lifecycle callback fail-closed checks", handler => {
  it.each(["", signedRequest("wrong-secret")])("rejects missing or invalid provider signatures before storage access", async signed => {
    expect((await handler(request(signed))).status).toBe(400);
    expect(createWorkspaceSupabaseClient).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled(); expect(adsWorker).not.toHaveBeenCalled();
  });
  it.each([
    ["KIRA_META_ADS_LOGIN_CONFIG_ID", ""], ["KIRA_META_APP_SECRET", ""],
    ["KIRA_META_CREDENTIAL_KEY", "weak"], ["NEXT_PUBLIC_APP_URL", "https://kira.example/path"],
  ])("rejects invalid shared configuration %s", async (name, value) => {
    vi.stubEnv(name, value);
    expect((await handler(request())).status).toBe(503);
    expect(createWorkspaceSupabaseClient).not.toHaveBeenCalled(); expect(adsWorker).not.toHaveBeenCalled();
  });
  it("returns a retryable error when either store refuses the revocation", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "42501" } });
    expect((await handler(request())).status).toBe(503); expect(adsWorker).not.toHaveBeenCalled();
    vi.mocked(adsWorker).mockRejectedValueOnce(new Error("private storage failure"));
    const response = await handler(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private storage failure");
  });
});
