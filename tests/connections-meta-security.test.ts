import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
import { getMetaConfig, META_READ_SCOPES } from "@/lib/connections/meta-config";
import { decryptMetaCredential, encryptMetaCredential, equalOAuthState, newOAuthState, signedMetaUser } from "@/lib/connections/meta-crypto";
import { exchangeMetaCode, verifyMetaToken } from "@/lib/connections/meta-provider";
const env = { KIRA_META_APP_ID: "123456", KIRA_META_APP_SECRET: "a".repeat(32), KIRA_META_LOGIN_CONFIG_ID: "654321", KIRA_META_GRAPH_VERSION: "v26.0", KIRA_META_CREDENTIAL_KEY: Buffer.alloc(32, 7).toString("base64"), NEXT_PUBLIC_APP_URL: "https://kira.example" };
const config = getMetaConfig(env)!;
afterEach(() => { vi.unstubAllGlobals(); });
describe("Meta secret and provider verification", () => {
  it("fails closed for incomplete/unsafe configuration and binds ciphertext to tenant and provider identity", () => {
    expect(getMetaConfig({})).toBeNull(); expect(getMetaConfig({ ...env, NEXT_PUBLIC_APP_URL: "https://evil.example/path" })).toBeNull();
    expect(getMetaConfig({ ...env, KIRA_META_CREDENTIAL_KEY: "weak" })).toBeNull();
    const cipher = encryptMetaCredential({ userToken: "private-token" }, config.credentialKey, "author-a", "123");
    expect(cipher).not.toContain("private-token");
    expect(decryptMetaCredential(cipher, config.credentialKey, "author-a", "123")).toEqual({ userToken: "private-token" });
    expect(() => decryptMetaCredential(cipher, config.credentialKey, "author-b", "123")).toThrow();
    expect(() => decryptMetaCredential(cipher, config.credentialKey, "author-a", "456")).toThrow();
    const parts = cipher.split(".");
    parts[3] = (parts[3].startsWith("a") ? "b" : "a") + parts[3].slice(1);
    expect(() => decryptMetaCredential(parts.join("."), config.credentialKey, "author-a", "123")).toThrow();
  });
  it("compares unpredictable OAuth state and validates provider signatures before extracting identity", () => {
    const state = newOAuthState(); expect(state).toHaveLength(43); expect(equalOAuthState(state, state)).toBe(true);
    expect(equalOAuthState(undefined, state)).toBe(false); expect(equalOAuthState(state, newOAuthState())).toBe(false);
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "123" })).toString("base64url");
    const signature = createHmac("sha256", config.appSecret).update(payload).digest("base64url");
    expect(signedMetaUser(`${signature}.${payload}`, config.appSecret)).toBe("123");
    expect(() => signedMetaUser(`${signature}.${payload}a`, config.appSecret)).toThrow();
    expect(() => signedMetaUser(`${signature}.${payload}`, "wrong-secret")).toThrow();
  });
  const debug = () => ({ data: { type: "USER", app_id: config.appId, user_id: "987", is_valid: true, expires_at: Math.floor(Date.now() / 1000) + 3600, scopes: [...META_READ_SCOPES] as string[] } });
  function installProvider(options: { expired?: boolean; wrongApp?: boolean; missingScope?: boolean; writeScope?: boolean; empty?: boolean; failure?: boolean } = {}) {
    const fetcher = vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("graph.facebook.com");
      if (options.failure) throw new Error("sensitive URL with private-token");
      if (url.pathname.endsWith("/oauth/access_token")) return Response.json({ access_token: "private-user-token", expires_in: 3600 });
      if (url.pathname.endsWith("/debug_token")) {
        const data = debug(); if (options.expired) data.data.expires_at = 1;
        if (options.wrongApp) data.data.app_id = "99999"; if (options.missingScope) data.data.scopes.pop();
        if (options.writeScope) data.data.scopes.push("pages_manage_posts");
        return Response.json(data);
      }
      if (url.pathname.endsWith("/me/accounts")) return Response.json({ data: options.empty ? [] : [{ id: "123", name: "Page", access_token: "private-page-token" }] });
      if (url.pathname.endsWith("/me")) return Response.json({ id: "987" });
      return Response.json({ id: "123", name: "Page", instagram_business_account: { id: "456", username: "author" } });
    });
    vi.stubGlobal("fetch", fetcher); return fetcher;
  }
  it("exchanges and verifies the token and actual account read before returning approved metadata", async () => {
    const fetcher = installProvider();
    const verified = await exchangeMetaCode(config, "one-time-code");
    expect(verified.accounts).toEqual([{ page_id: "123", page_name: "Page", instagram_id: "456", instagram_username: "author" }]);
    expect(JSON.stringify(verified.accounts)).not.toContain("token");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it.each([{ expired: true }, { wrongApp: true }, { missingScope: true }, { writeScope: true }, { empty: true }, { failure: true }])("refuses failed verification %j and never exposes transport secrets", async options => {
    installProvider(options);
    await expect(verifyMetaToken(config, "private-user-token")).rejects.toThrow(/reconnect|permissions|no_accounts|provider_unavailable/);
    try { await verifyMetaToken(config, "private-user-token"); } catch (error) { expect(String(error)).not.toContain("private-token"); }
  });
});
