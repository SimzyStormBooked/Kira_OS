import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/client", () => ({ createWorkspaceSupabaseClient: vi.fn() }));
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { POST as login } from "@/app/auth/login/route";
import { POST as logout } from "@/app/auth/logout/route";

const authorId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const getUser = vi.fn();
const maybeSingle = vi.fn();
const client = { auth: { signInWithPassword, signOut, getUser }, from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
function loginRequest(next = "/desk", origin = "https://kira.example") {
  return new Request("https://kira.example/auth/login", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "member@example.test", password: "test-only-password", next }),
  });
}

describe("Private sign-in and sign-out routes", () => {
  beforeEach(() => {
    vi.stubEnv("KIRA_WORKSPACE_MODE", "connected");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example_public_key_for_tests");
    vi.stubEnv("KIRA_AUTHOR_ID", authorId);
    signInWithPassword.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "member", email: "member@example.test" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: authorId }, error: null });
    vi.mocked(createWorkspaceSupabaseClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createWorkspaceSupabaseClient>>);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("only opens the requested internal destination after verified membership", async () => {
    const response = await login(loginRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/desk" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(signInWithPassword).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledOnce();
  });
  it("neutralizes an external redirect supplied at sign-in", async () => {
    const response = await login(loginRequest("//evil.example"));
    expect(await response.json()).toEqual({ redirectTo: "/" });
  });
  it("blocks cross-origin login before accepting any credentials", async () => {
    const response = await login(loginRequest("/", "https://evil.example"));
    expect(response.status).toBe(403);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it("clears the local session when a signed-in account is outside the workspace", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await login(loginRequest());
    expect(response.status).toBe(403);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await response.text()).not.toContain("test-only-password");
  });
  it("returns a generic failure without exposing provider detail", async () => {
    signInWithPassword.mockResolvedValue({ error: { status: 400, message: "Internal account detail" } });
    const response = await login(loginRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Internal account detail");
    expect(getUser).not.toHaveBeenCalled();
  });
  it("preserves rate-limit failures for the caller", async () => {
    signInWithPassword.mockResolvedValue({ error: { status: 429 } });
    expect((await login(loginRequest())).status).toBe(429);
  });
  it("fails closed for a connected deployment without configuration", async () => {
    vi.stubEnv("KIRA_AUTHOR_ID", "");
    expect((await login(loginRequest())).status).toBe(503);
    expect(createWorkspaceSupabaseClient).not.toHaveBeenCalled();
  });
  it("rejects cross-origin logout and supports same-origin POST logout", async () => {
    const bad = await logout(new Request("https://kira.example/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(bad.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
    const good = await logout(new Request("https://kira.example/auth/logout", { method: "POST", headers: { origin: "https://kira.example" } }));
    expect(good.status).toBe(303);
    expect(good.headers.get("location")).toBe("/login");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
