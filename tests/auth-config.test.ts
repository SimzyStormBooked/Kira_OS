import { describe, expect, it } from "vitest";
import { getWorkspaceConfig } from "@/lib/config";
import { assertSameOrigin, safeRedirectPath } from "@/lib/auth/security";
import { WorkspaceAccessError } from "@/lib/auth/errors";

const connected = {
  KIRA_WORKSPACE_MODE: "connected",
  NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_public_key_for_tests",
  KIRA_AUTHOR_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
};
const legacyKey = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.signature`;

describe("Private workspace configuration", () => {
  it("keeps the unconfigured local experience explicitly in demo mode", () => {
    expect(getWorkspaceConfig({})).toMatchObject({ mode: "demo", configured: true, authorId: null });
  });
  it("does not silently fall back to demo for a misspelled or empty mode", () => {
    for (const mode of ["conected", "", "production"]) {
      expect(getWorkspaceConfig({ ...connected, KIRA_WORKSPACE_MODE: mode })).toMatchObject({ mode: "connected", configured: false, authorId: null });
    }
  });
  it("requires all connection settings and a workspace UUID", () => {
    for (const field of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "KIRA_AUTHOR_ID"]) {
      expect(getWorkspaceConfig({ ...connected, [field]: undefined }).configured).toBe(false);
    }
    expect(getWorkspaceConfig({ ...connected, KIRA_AUTHOR_ID: "kira" }).configured).toBe(false);
    expect(getWorkspaceConfig(connected)).toMatchObject({ mode: "connected", configured: true, authorId: connected.KIRA_AUTHOR_ID });
  });
  it("rejects secret and service-role keys rather than bypassing RLS", () => {
    for (const key of ["sb_secret_do_not_use", legacyKey("service_role"), "paste-key-here"]) {
      expect(getWorkspaceConfig({ ...connected, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }).configured).toBe(false);
    }
    expect(getWorkspaceConfig({ ...connected, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon") }).configured).toBe(true);
  });
  it("refuses remote plaintext URLs and embedded credentials while supporting local Supabase", () => {
    for (const url of ["http://example.com", "https://user:password@example.com", "https://example.com/rest/v1", "https://example.com?key=foo", "bad-url"]) {
      expect(getWorkspaceConfig({ ...connected, NEXT_PUBLIC_SUPABASE_URL: url }).configured).toBe(false);
    }
    expect(getWorkspaceConfig({ ...connected, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).configured).toBe(true);
  });
  it("never includes configured values in validation errors", () => {
    const result = getWorkspaceConfig({ ...connected, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_example_sensitive_value" });
    expect(result.errors.join(" ")).not.toContain("example_sensitive_value");
    expect(result.supabasePublishableKey).toBeNull();
  });
  it("fails closed for an invalid configured application origin", () => {
    expect(getWorkspaceConfig({ ...connected, NEXT_PUBLIC_APP_URL: "https://kira.example/a-path" }).configured).toBe(false);
    expect(getWorkspaceConfig({ ...connected, NEXT_PUBLIC_APP_URL: "http://kira.example" }).configured).toBe(false);
    expect(getWorkspaceConfig({ ...connected, NEXT_PUBLIC_APP_URL: "https://kira.example" }).configured).toBe(true);
  });
});

describe("Redirect and mutation boundaries", () => {
  it("preserves a normal local destination", () => {
    expect(safeRedirectPath("/universe/a-book?tab=notes#details")).toBe("/universe/a-book?tab=notes#details");
  });
  it.each([
    "https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example",
    "/%5cevil.example", "/\nevil.example", "/%00evil.example", "/auth/logout", "/api/raven", "/login", "/%61uth/logout",
    "/desk/..//evil.example", "/%2e%2e//evil.example", "/desk/../%2f/evil.example", "/%", null, ["/desk"],
  ])("rejects unsafe redirect %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
  it("accepts a same-origin browser mutation", () => {
    const request = new Request("https://kira.example/auth/login", { method: "POST", headers: { origin: "https://kira.example", "sec-fetch-site": "same-origin" } });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });
  it("uses the configured public origin when the server URL is internal", () => {
    const request = new Request("http://internal-server:3000/auth/login", {
      method: "POST", headers: { origin: "https://kira.example", host: "internal-server:3000", "sec-fetch-site": "same-origin" },
    });
    expect(() => assertSameOrigin(request, { NEXT_PUBLIC_APP_URL: "https://kira.example" })).not.toThrow();
    expect(() => assertSameOrigin(request, { NEXT_PUBLIC_APP_URL: "https://different.example" })).toThrow(WorkspaceAccessError);
    expect(() => assertSameOrigin(request, { NEXT_PUBLIC_APP_URL: "not-an-origin" })).toThrow(WorkspaceAccessError);
  });
  it("supports Next's loopback normalization without trusting forwarded headers", () => {
    const request = new Request("http://localhost:3102/auth/login", {
      method: "POST", headers: { host: "127.0.0.1:3102", origin: "http://127.0.0.1:3102", "x-forwarded-host": "evil.example" },
    });
    expect(() => assertSameOrigin(request, {})).not.toThrow();
    const forged = new Request("https://kira.example/auth/login", {
      method: "POST", headers: { host: "kira.example", origin: "https://evil.example", "x-forwarded-host": "evil.example" },
    });
    expect(() => assertSameOrigin(forged, {})).toThrow(WorkspaceAccessError);
  });
  it.each(["evil.example/path", "user@evil.example", "evil.example\\anything", "evil.example, kira.example", "kira.example:70000"])("rejects malformed Host %s", (host) => {
    const request = new Request("https://kira.example/auth/login", { method: "POST", headers: { host, origin: "https://kira.example" } });
    expect(() => assertSameOrigin(request, {})).toThrow(WorkspaceAccessError);
  });
  it("rejects absent, sibling-subdomain and cross-site origins even with a spoofed forwarded host", () => {
    for (const origin of [null, "https://other.kira.example", "https://evil.example"]) {
      const headers = new Headers({ "x-forwarded-host": "evil.example" });
      if (origin) headers.set("origin", origin);
      expect(() => assertSameOrigin(new Request("https://kira.example/auth/logout", { method: "POST", headers }))).toThrow(WorkspaceAccessError);
    }
    expect(() => assertSameOrigin(new Request("https://kira.example/auth/logout", {
      method: "POST", headers: { origin: "https://kira.example", "sec-fetch-site": "cross-site" },
    }))).toThrow(WorkspaceAccessError);
  });
});
