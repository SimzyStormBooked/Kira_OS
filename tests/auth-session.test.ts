import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/client", () => ({ createWorkspaceSupabaseClient: vi.fn() }));
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { getWorkspaceSession, requireWorkspaceSession, verifyWorkspaceAccess } from "@/lib/auth/session";

const authorId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
function makeClient({ user = { id: "member-id", email: "member@example.test" } as { id: string; email: string; is_anonymous?: boolean } | null,
  authError = null as { status: number } | null, author = { id: authorId } as { id: string } | null,
  databaseError = null as { code: string } | null } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: author, error: databaseError });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }), getSession: vi.fn() }, from: vi.fn().mockReturnValue({ select }), select, eq };
}
function asClient(client: ReturnType<typeof makeClient>) { return client as unknown as SupabaseClient; }

describe("Verified workspace access", () => {
  beforeEach(() => {
    vi.stubEnv("KIRA_WORKSPACE_MODE", "connected");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example_public_key_for_tests");
    vi.stubEnv("KIRA_AUTHOR_ID", authorId);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("uses the server-confirmed user and the configured author under RLS", async () => {
    const client = makeClient();
    const session = await verifyWorkspaceAccess(asClient(client), authorId);
    expect(session).toMatchObject({ authorization: "authorized", authorId, user: { id: "member-id" } });
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith("authors");
    expect(client.eq).toHaveBeenCalledWith("id", authorId);
  });
  it("does not authorize a valid account that cannot see the workspace", async () => {
    const client = makeClient({ author: null });
    vi.mocked(createWorkspaceSupabaseClient).mockResolvedValue(asClient(client));
    expect(await getWorkspaceSession()).toMatchObject({ authorization: "forbidden", authorId: null });
    await expect(requireWorkspaceSession()).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
  it("rejects forged or expired cookies before querying tenant data", async () => {
    const client = makeClient({ user: null, authError: { status: 401 } });
    vi.mocked(createWorkspaceSupabaseClient).mockResolvedValue(asClient(client));
    await expect(requireWorkspaceSession()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    expect(client.from).not.toHaveBeenCalled();
  });
  it("does not grant private access to anonymous Supabase users", async () => {
    const client = makeClient({ user: { id: "guest", email: "", is_anonymous: true } });
    expect(await verifyWorkspaceAccess(asClient(client), authorId)).toMatchObject({ authorization: "anonymous", user: null, authorId: null });
    expect(client.from).not.toHaveBeenCalled();
  });
  it("fails closed when the database is unavailable instead of loading demo data", async () => {
    const client = makeClient({ databaseError: { code: "42P01" } });
    vi.mocked(createWorkspaceSupabaseClient).mockResolvedValue(asClient(client));
    await expect(requireWorkspaceSession()).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
  it("distinguishes an Auth outage from a signed-out user", async () => {
    const client = makeClient({ user: null, authError: { status: 503 } });
    expect(await verifyWorkspaceAccess(asClient(client), authorId)).toMatchObject({ authorization: "unavailable" });
  });
  it("does not initialize a client for missing connected configuration", async () => {
    vi.stubEnv("KIRA_AUTHOR_ID", "");
    await expect(requireWorkspaceSession()).rejects.toMatchObject({ status: 503, code: "unconfigured" });
    expect(createWorkspaceSupabaseClient).not.toHaveBeenCalled();
  });
  it("does not initialize Supabase in demo mode or treat demo as an authenticated session", async () => {
    vi.stubEnv("KIRA_WORKSPACE_MODE", "demo");
    expect(await getWorkspaceSession()).toMatchObject({ authorization: "demo", mode: "demo", user: null });
    await expect(requireWorkspaceSession()).rejects.toMatchObject({ status: 503 });
    expect(createWorkspaceSupabaseClient).not.toHaveBeenCalled();
  });
});
