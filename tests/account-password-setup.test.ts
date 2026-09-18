import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/client", () => ({ createWorkspaceSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth/session", async () => ({
  WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError,
  requireWorkspaceSession: vi.fn(),
}));
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getPasswordSetupEligibility } from "@/lib/auth/password-setup";
import { POST } from "@/app/api/account/password/setup/route";

const now = 1_800_000_000;
const user = { id: "synthetic-member", email: "member@example.test" };
const getClaims = vi.fn(), updateUser = vi.fn();
const client = { auth: { getClaims, updateUser } } as unknown as Awaited<ReturnType<typeof createWorkspaceSupabaseClient>>;
const session = { user, supabase: client } as Awaited<ReturnType<typeof requireWorkspaceSession>>;
const input = { newPassword: "Synthetic-chosen-password-123!", confirmPassword: "Synthetic-chosen-password-123!" };
function claims(overrides: Record<string, unknown> = {}) {
  return { sub: user.id, exp: now + 3600, amr: [{ method: "otp", timestamp: now - 60 }], ...overrides };
}
function proof(overrides: Record<string, unknown> = {}) { getClaims.mockResolvedValue({ data: { claims: claims(overrides) }, error: null }); }
function request(body: unknown = input, origin: string | null = "https://kira.example") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("Origin", origin);
  return new Request("https://kira.example/api/account/password/setup", { method: "POST", headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now * 1000);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://kira.example");
  vi.mocked(requireWorkspaceSession).mockResolvedValue(session);
  vi.mocked(createWorkspaceSupabaseClient).mockResolvedValue(client);
  proof(); updateUser.mockResolvedValue({ data: { user }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Verified recent-link password eligibility", () => {
  it.each(["otp", "magiclink"])("accepts recent signed %s proof for the verified member", async method => {
    proof({ amr: [{ method, timestamp: now - 60 }] });
    expect(await getPasswordSetupEligibility(session)).toEqual({ eligible: true, expiresAt: now + 840 });
    expect(getClaims).toHaveBeenCalledExactlyOnceWith();
  });
  it("limits eligibility to token expiry and accepts only bounded future clock skew", async () => {
    proof({ exp: now + 10, amr: [{ method: "otp", timestamp: now + 30 }] });
    expect(await getPasswordSetupEligibility(session)).toEqual({ eligible: true, expiresAt: now + 10 });
    proof({ amr: [{ method: "otp", timestamp: now + 31 }] });
    expect((await getPasswordSetupEligibility(session)).eligible).toBe(false);
  });
  it.each([
    { sub: "different-user" }, { is_anonymous: true }, { exp: now }, { exp: "1900000000" },
    { exp: Number.POSITIVE_INFINITY }, { amr: undefined }, { amr: [] }, { amr: ["otp"] },
    { amr: [{ method: "password", timestamp: now }] },
    { amr: [{ method: "token_refresh", timestamp: now }], iat: now },
    { amr: [{ method: "otp", timestamp: now - 901 }], iat: now },
    { amr: [{ method: "otp", timestamp: String(now) }] },
    { amr: [{ method: "otp", timestamp: now + 0.5 }] },
    { amr: [{ method: "otp", timestamp: Number.NaN }] },
    { amr: [null] },
  ])("rejects unsupported, stale or mismatched claims %#", async overrides => {
    proof(overrides);
    expect(await getPasswordSetupEligibility(session)).toEqual({ eligible: false, reason: "recent_link_required" });
  });
  it("does not mistake a missing session for recent authentication", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await getPasswordSetupEligibility(session)).toEqual({ eligible: false, reason: "recent_link_required" });
  });
  it.each(["error", "throw"])("fails closed when verification fails (%s)", async failure => {
    if (failure === "error") getClaims.mockResolvedValue({ data: { claims: claims() }, error: { message: "signature failure" } });
    else getClaims.mockRejectedValue(new Error("private provider detail"));
    expect(await getPasswordSetupEligibility(session)).toEqual({ eligible: false, reason: "unavailable" });
  });
});

describe("Recent-link password choice endpoint", () => {
  it("rechecks signed proof on the writable caller client before updating only that account", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ changed: true });
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(requireWorkspaceSession).toHaveBeenCalledOnce();
    expect(createWorkspaceSupabaseClient).toHaveBeenCalledWith({ writableCookies: true });
    expect(getClaims).toHaveBeenCalledExactlyOnceWith();
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({ password: input.newPassword });
    expect(getClaims.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0]);
  });
  it.each([[401, "unauthenticated"], [403, "forbidden"], [503, "unconfigured"]] as const)("requires workspace access (%i)", async (status, code) => {
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(status, code, "Access unavailable"));
    expect((await POST(request())).status).toBe(status); expect(updateUser).not.toHaveBeenCalled();
  });
  it.each([null, "null", "https://evil.example"])("requires same origin (%s)", async origin => {
    expect((await POST(request(input, origin))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled(); expect(updateUser).not.toHaveBeenCalled();
  });
  it("checks expiry again even if the settings page previously allowed setup", async () => {
    expect((await getPasswordSetupEligibility(session)).eligible).toBe(true);
    vi.setSystemTime((now + 841) * 1000);
    const response = await POST(request());
    expect(response.status).toBe(403); expect(await response.text()).toContain("fresh sign-in link");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("returns a safe retryable failure when proof cannot be verified", async () => {
    getClaims.mockRejectedValue(new Error(`PRIVATE ${input.newPassword}`));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, newPassword: "short", confirmPassword: "short" },
    { ...input, newPassword: "x".repeat(129), confirmPassword: "x".repeat(129) },
    { ...input, newPassword: "😀".repeat(6), confirmPassword: "😀".repeat(6) },
    { ...input, confirmPassword: "Another synthetic password" },
    { ...input, userId: "other-user" }, { ...input, email: "other@example.test" },
    { ...input, currentPassword: "ignored-password" }, {},
  ])("rejects invalid input and caller-supplied identity %#", async body => {
    const response = await POST(request(body));
    expect(response.status).toBe(400); expect(await response.text()).not.toContain(input.newPassword);
    expect(getClaims).not.toHaveBeenCalled(); expect(updateUser).not.toHaveBeenCalled();
  });
  it("bounds actual request bytes and rejects missing, malformed or non-JSON bodies", async () => {
    const oversized = request({ newPassword: "😀".repeat(1100) }); oversized.headers.set("Content-Length", "20");
    expect((await POST(oversized)).status).toBe(413);
    for (const body of [undefined, "{invalid-json"]) {
      expect((await POST(new Request("https://kira.example/api/account/password/setup", {
        method: "POST", headers: { Origin: "https://kira.example", "Content-Type": "application/json" }, body,
      }))).status).toBe(400);
    }
    const wrongType = request(); wrongType.headers.set("Content-Type", "text/plain");
    expect((await POST(wrongType)).status).toBe(415);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it.each([[422, 400], [429, 429], [503, 503]] as const)("handles provider failure %i without exposing passwords", async (status, expected) => {
    updateUser.mockResolvedValue({ error: { status, message: input.newPassword } });
    const response = await POST(request());
    expect(response.status).toBe(expected); expect(await response.text()).not.toContain(input.newPassword);
  });
});
