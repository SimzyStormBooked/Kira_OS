import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
vi.mock("@/lib/discovery/repository", () => ({ discoveryControl: vi.fn(), discoveryWorker: vi.fn(), loadDiscoveryView: vi.fn() }));
vi.mock("@/lib/discovery/google", () => ({ googleConfig: vi.fn(), authorizationUrl: vi.fn(), decryptGoogle: vi.fn(), revokeGoogle: vi.fn(), exchangeGoogleCode: vi.fn(), googleProperties: vi.fn(), encryptGoogle: vi.fn() }));
vi.mock("@/workflows/discovery", () => ({ refreshDiscoveryInBackground: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));

import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { discoveryControl, discoveryWorker, loadDiscoveryView } from "@/lib/discovery/repository";
import { googleConfig, authorizationUrl, exchangeGoogleCode } from "@/lib/discovery/google";
import { start } from "workflow/api";
import { GET, POST } from "@/app/api/discovery/route";
import { POST as audit } from "@/app/api/discovery/audit/route";
import { POST as upload } from "@/app/api/discovery/import/route";
import { POST as google } from "@/app/api/discovery/google/route";
import { POST as connect } from "@/app/api/discovery/google/start/route";
import { GET as callback } from "@/app/api/discovery/google/callback/route";

const origin = "https://kira.test", authorId = randomUUID(), userId = randomUUID(), pageId = randomUUID(), jobId = randomUUID();
const supabase = {} as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"];
const view = { available: true, canEdit: true, books: [], pages: [], listings: [], reports: [], actions: [], jobs: [], google: { configured: false, connected: false, properties: [], selectedProperty: null, connectedAt: null, lastError: null } };
const page = { action: "page", label: "Author home", url: "https://author.example.com/", bookId: null, kind: "website" };
const csv = "Date,Clicks,Impressions,CTR,Position\n2026-01-01,2,10,20%,4\n";
const config = { clientId: "test-client", clientSecret: "test-secret", key: Buffer.alloc(32), origin, callback: `${origin}/api/discovery/google/callback` };

function request(body: unknown = {}, site: string | null = origin) {
  return new Request(`${origin}/api/discovery`, { method: "POST", headers: { "Content-Type": "application/json", ...(site ? { Origin: site } : {}) }, body: JSON.stringify(body) });
}
function form() {
  const result = new FormData();
  result.set("file", new File([csv], "Dates.csv", { type: "text/csv" }));
  result.set("since", "2026-01-01"); result.set("until", "2026-01-02"); result.set("property", "https://author.example.com/");
  return result;
}
function multipart(body = form()) { return new Request(`${origin}/api/discovery/import`, { method: "POST", headers: { Origin: origin }, body }); }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.mocked(requireWorkspaceSession).mockResolvedValue({ mode: "connected", configured: true, authorization: "authorized", authorId, user: { id: userId, email: "fixture@example.test" }, supabase });
  vi.mocked(getWorkspaceRole).mockResolvedValue("editor");
  vi.mocked(loadDiscoveryView).mockResolvedValue(view);
  vi.mocked(discoveryControl).mockResolvedValue({ id: jobId, state: "queued" });
  vi.mocked(discoveryWorker).mockResolvedValue({});
  vi.mocked(googleConfig).mockReturnValue(null);
  vi.mocked(authorizationUrl).mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?state=test");
  vi.mocked(start).mockResolvedValue({} as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("discovery HTTP authority and imports", () => {
  it("uses the verified session tenant and keeps reads and mutations private", async () => {
    for (const response of [await GET(), await POST(request(page))]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(discoveryControl).toHaveBeenCalledWith(supabase, authorId, "page", page);
  });

  it("refuses missing and foreign mutation origins before accessing any session", async () => {
    for (const handler of [POST, audit, upload, google, connect]) for (const site of [null, "https://elsewhere.test"]) {
      expect((await handler(request({}, site))).status).toBe(403);
    }
    expect(requireWorkspaceSession).not.toHaveBeenCalled();
    expect(discoveryControl).not.toHaveBeenCalled();
  });

  it("refuses unauthenticated sessions without touching storage", async () => {
    const error = new WorkspaceAccessError(401, "unauthenticated", "Sign in.");
    vi.mocked(requireWorkspaceSession).mockRejectedValue(error);
    vi.mocked(loadDiscoveryView).mockRejectedValue(error);
    expect((await GET()).status).toBe(401);
    for (const handler of [POST, audit, upload, google, connect]) expect((await handler(request(page))).status).toBe(401);
    expect(discoveryControl).not.toHaveBeenCalled();
  });

  it("rejects spoofed tenant fields, unsafe page URLs and malformed inputs before persistence", async () => {
    for (const body of [{ ...page, authorId: randomUUID() }, { ...page, accessToken: "untrusted-token" }, { ...page, url: "http://author.example.com/" }, { ...page, label: "" }]) expect((await POST(request(body))).status).toBe(400);
    expect((await audit(request({ pageId, authorId }))).status).toBe(400);
    expect((await google(request({ action: "sync", property: "forged" }))).status).toBe(400);
    const malformed = new Request(`${origin}/api/discovery`, { method: "POST", headers: { Origin: origin }, body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    expect(discoveryControl).not.toHaveBeenCalled();
  });

  it("bounds actual body bytes even when Content-Length is missing or misleading", async () => {
    const oversized = request({ ...page, label: "😀".repeat(6000) });
    oversized.headers.set("Content-Length", "10");
    expect((await POST(oversized)).status).toBe(413);
    expect((await audit(request({ pageId, extra: "x".repeat(5000) }))).status).toBe(413);
    expect((await upload(request({ data: "x".repeat(2100001) }))).status).toBe(413);
    expect(discoveryControl).not.toHaveBeenCalled();
  });

  it("parses a CSV into a manual snapshot for the current tenant without claiming Google sync", async () => {
    const response = await upload(multipart());
    expect(response.status).toBe(200);
    expect(discoveryControl).toHaveBeenCalledWith(supabase, authorId, "search", { snapshot: expect.objectContaining({ data_origin: "manual_snapshot", property: "https://author.example.com/", dimension: "date", totals: { clicks: 2, impressions: 10, ctr: 0.2, position: 4 } }) });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns actionable 400 errors for malformed multipart, duplicate fields and invalid CSV metadata", async () => {
    const malformed = new Request(`${origin}/api/discovery/import`, { method: "POST", headers: { Origin: origin, "Content-Type": "multipart/form-data; boundary=absent" }, body: "not a multipart body" });
    expect((await upload(malformed)).status).toBe(400);
    for (const modify of [
      (f: FormData) => f.delete("property"),
      (f: FormData) => f.append("property", "spoofed"),
      (f: FormData) => f.set("property", new File(["data"], "not-text.txt")),
      (f: FormData) => f.set("authorId", randomUUID()),
      (f: FormData) => f.set("since", "not-a-date"),
      (f: FormData) => f.set("file", new File([csv], "wrong.pdf")),
      (f: FormData) => f.set("file", new File(["Date,Clicks\nbroken"], "broken.csv")),
      (f: FormData) => f.set("file", new File(["x".repeat(2000001)], "too-large.csv")),
    ]) { const body = form(); modify(body); expect((await upload(multipart(body))).status).toBe(400); }
    expect(discoveryControl).not.toHaveBeenCalled();
  });

  it("refuses viewer imports before parsing the file", async () => {
    vi.mocked(getWorkspaceRole).mockResolvedValue("viewer");
    expect((await upload(request({ data: "invalid multipart" }))).status).toBe(403);
    expect(discoveryControl).not.toHaveBeenCalled();
  });
});

describe("Google setup and durable dispatch", () => {
  it("keeps missing Google configuration disabled without creating consent or refresh jobs", async () => {
    for (const response of [await connect(request()), await google(request({ action: "sync" }))]) {
      expect(response.status).toBe(409);
      expect(await response.text()).toContain("setup is pending");
    }
    expect(discoveryControl).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("marks queued audits failed when dispatch fails, hides provider details and reuses running work", async () => {
    vi.mocked(start).mockRejectedValue(new Error("Private workflow provider detail"));
    const failed = await audit(request({ pageId }));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("Private workflow provider detail");
    expect(discoveryWorker).toHaveBeenCalledWith("fail", jobId, null, { code: "interrupted" });
    expect(discoveryControl).toHaveBeenCalledWith(supabase, authorId, "audit", { pageId });
    vi.mocked(start).mockClear();
    vi.mocked(discoveryControl).mockResolvedValue({ id: jobId, state: "running" });
    expect((await audit(request({ pageId }))).status).toBe(200);
    expect(start).not.toHaveBeenCalled();
  });

  it("starts consent using a hashed state and a secure short-lived callback cookie", async () => {
    vi.mocked(googleConfig).mockReturnValue(config);
    const response = await connect(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/api/discovery/google/callback"); expect(cookie).toContain("Max-Age=600");
    expect(discoveryControl).toHaveBeenCalledWith(supabase, authorId, "begin", { hash: expect.stringMatching(/^[a-f0-9]{64}$/) }, true);
  });

  it("rejects a mismatched callback state before exchanging its code or saving a connection", async () => {
    vi.mocked(googleConfig).mockReturnValue(config);
    const response = await callback(new NextRequest(`${origin}/api/discovery/google/callback?state=${"a".repeat(43)}&code=never-exchange`, { headers: { cookie: `kira_discovery_oauth=${"b".repeat(43)}.${"c".repeat(43)}` } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/discoverability?connection=failed`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(exchangeGoogleCode).not.toHaveBeenCalled();
    expect(discoveryControl).not.toHaveBeenCalled();
  });
});
