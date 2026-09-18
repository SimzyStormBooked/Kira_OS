import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/client", () => ({ createWorkspaceSupabaseClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { cookies } from "next/headers";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { GET, POST } from "@/app/auth/welcome/route";

const authorId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const token = "f".repeat(64);
const verifyOtp = vi.fn();
const signOut = vi.fn();
const getUser = vi.fn();
const maybeSingle = vi.fn();
const setCookie = vi.fn();
const client = { auth: { verifyOtp, signOut, getUser }, from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
function request(body: unknown = { token_hash: token }, origin = "https://kira.example", contentType = "application/json") {
  return new Request("https://kira.example/auth/welcome", { method: "POST", headers: { origin, "content-type": contentType }, body: JSON.stringify(body) });
}
function expectNoConsumption() { expect(createWorkspaceSupabaseClient).not.toHaveBeenCalled(); expect(verifyOtp).not.toHaveBeenCalled(); }

describe("One-time welcome sign-in", () => {
  beforeEach(() => {
    vi.stubEnv("KIRA_WORKSPACE_MODE", "connected");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://kira.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example_public_key_for_tests");
    vi.stubEnv("KIRA_AUTHOR_ID", authorId);
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "synthetic-session" }, user: { id: "member" } }, error: null });
    signOut.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "member", email: "member@example.test" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: authorId }, error: null });
    vi.mocked(createWorkspaceSupabaseClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createWorkspaceSupabaseClient>>);
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [{ name: "sb-test-project-auth-token.0", value: "synthetic" }, { name: "unrelated", value: "keep" }], set: setCookie } as unknown as Awaited<ReturnType<typeof cookies>>);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("GET never creates a client or consumes a one-time token", async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expectNoConsumption();
  });
  it("uses only magiclink verification with writable cookies and verifies membership", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/" });
    expect(createWorkspaceSupabaseClient).toHaveBeenCalledWith({ writableCookies: true });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: token, type: "magiclink" });
    expect(getUser).toHaveBeenCalledOnce();
    expect(maybeSingle).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("rejects cross-origin requests without consuming the token", async () => {
    expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403);
    expectNoConsumption();
  });
  it.each(["demo", "unconfigured"])("fails closed in %s mode before consuming", async (mode) => {
    if (mode === "demo") vi.stubEnv("KIRA_WORKSPACE_MODE", "demo");
    else vi.stubEnv("KIRA_AUTHOR_ID", "");
    expect((await POST(request())).status).toBe(503);
    expectNoConsumption();
  });
  it("requires JSON content type", async () => {
    expect((await POST(request(undefined, undefined, "text/plain"))).status).toBe(415);
    expectNoConsumption();
  });
  it.each([{ token_hash: token, type: "recovery" }, { token_hash: token, next: "https://evil.example" }, { token_hash: "short" }, { token_hash: "<script>invalid</script>" }, {}])("rejects unsupported or malformed input %#", async (input) => {
    const response = await POST(request(input));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(token);
    expectNoConsumption();
  });
  it("bounds actual streamed bytes even with a misleading content-length", async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ token_hash: "é".repeat(3000) }));
    const stream = new ReadableStream({ start(controller) { controller.enqueue(payload.slice(0, 2000)); controller.enqueue(payload.slice(2000)); controller.close(); } });
    const input = new Request("https://kira.example/auth/welcome", { method: "POST", headers: { origin: "https://kira.example", "content-type": "application/json", "content-length": "20" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(input)).status).toBe(413);
    expectNoConsumption();
  });
  it("returns a generic used/expired response without provider detail", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { status: 403, message: `secret-provider-detail ${token}` } });
    const response = await POST(request());
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(text).toContain("expired or has already been used");
    expect(text).not.toContain(token);
    expect(text).not.toContain("secret-provider-detail");
    expect(getUser).not.toHaveBeenCalled();
  });
  it.each([429, 500])("preserves safe status for provider failure %s", async status => {
    verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { status, message: "internal detail" } });
    const response = await POST(request());
    expect(response.status).toBe(status === 429 ? 429 : 503);
    expect(await response.text()).not.toContain("internal detail");
  });
  it("cannot reuse an existing browser session when OTP supplies no new session", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null, user: { id: "member" } }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it.each(["forbidden", "unavailable", "identity-mismatch"])("clears the new session when access is %s", async reason => {
    if (reason === "forbidden") maybeSingle.mockResolvedValue({ data: null, error: null });
    if (reason === "unavailable") maybeSingle.mockResolvedValue({ data: null, error: { message: "private outage detail" } });
    if (reason === "identity-mismatch") getUser.mockResolvedValue({ data: { user: { id: "other-account" } }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(reason === "unavailable" ? 503 : 403);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(setCookie).toHaveBeenCalledWith("sb-test-project-auth-token", "", expect.objectContaining({ maxAge: 0, httpOnly: true, sameSite: "lax", path: "/" }));
    expect(setCookie).toHaveBeenCalledWith("sb-test-project-auth-token.0", "", expect.objectContaining({ maxAge: 0 }));
    expect(setCookie.mock.calls.some(call => call[0] === "unrelated")).toBe(false);
  });
  it("expires browser cookies even if local sign-out cannot reach Auth", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    signOut.mockRejectedValue(new Error("private auth outage"));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(setCookie).toHaveBeenCalled();
    expect(await response.text()).not.toContain("private auth outage");
  });
  it("cleans up an uncertain verification exception and never leaks tokens", async () => {
    verifyOtp.mockRejectedValue(new Error(`private token ${token}`));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(setCookie).toHaveBeenCalled();
    expect(await response.text()).not.toContain(token);
  });
});
