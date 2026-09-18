/**
 * Loopback-only simulated Supabase boundary for browser wiring tests.
 * The real app still calls Supabase Auth, PostgREST and RPC through its unchanged SDKs.
 * This is not a database/security substitute: SQL and RLS are exercised by PGlite tests.
 * No cloud calls, users, emails, paid models or external side effects occur here.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import type { ApprovalRequest, HumanFeedback } from "../../types/domain";
import { connectionInputSchema, type ConnectionLink } from "../../lib/connections/schema";
import { fixture } from "./fixture-data";

const signingSecret = "local-test-fixture-signing-secret-not-for-production";
const sessions = new Map<string, { user: User; refreshToken: string }>();
const welcomeTokens = new Map([
  ["fixture-welcome-member-token", fixture.memberEmail],
  ["fixture-welcome-outsider-token", fixture.outsiderEmail],
]);
const consumedWelcomeTokens = new Set<string>();
let welcomeVerificationRequests = 0;
let approvals: ApprovalRequest[] = [];
let feedback: HumanFeedback[] = [];
type FixtureMember = { id: string; userId: string; email: string; role: "editor" | "viewer"; version: number; createdAt: string; updatedAt: string };
let members: FixtureMember[] = [];
let links: ConnectionLink[] = [];
const userFor = (email: string): User => ({
  id: email === fixture.memberEmail ? fixture.memberId : fixture.outsiderId,
  aud: "authenticated", role: "authenticated", email,
  email_confirmed_at: "2026-01-01T00:00:00.000Z", phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00.000Z", is_anonymous: false,
});
function issueSession(user: User) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email, aud: "authenticated", role: "authenticated",
    iss: `${fixture.supabaseUrl}/auth/v1`, iat: now, exp: now + 3600,
    session_id: randomUUID(), aal: "aal1", is_anonymous: false,
  })).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(`${header}.${payload}`).digest("base64url");
  const accessToken = `${header}.${payload}.${signature}`;
  const refreshToken = randomUUID();
  sessions.set(accessToken, { user, refreshToken });
  return { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refreshToken, user };
}
function authenticated(request: IncomingMessage) {
  const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = createHmac("sha256", signingSecret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (parts[2] !== expected) return null;
  return sessions.get(token) ?? null;
}
function respond(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}
async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (Buffer.byteLength(body) > 100000) throw new Error("Fixture body limit exceeded");
  }
  return body ? JSON.parse(body) : {};
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", fixture.supabaseUrl);
    if (url.pathname === "/__test/health") return respond(response, 200, { simulated: true });
    if (url.pathname === "/__test/welcome" && request.method === "GET") {
      return respond(response, 200, { verificationRequests: welcomeVerificationRequests, consumedTokens: consumedWelcomeTokens.size });
    }
    if (url.pathname === "/__test/reset" && request.method === "POST") {
      approvals = []; feedback = []; members = []; links = []; sessions.clear();
      consumedWelcomeTokens.clear(); welcomeVerificationRequests = 0;
      return respond(response, 200, { simulated: true, reset: true });
    }
    if (url.pathname === "/auth/v1/verify" && request.method === "POST") {
      welcomeVerificationRequests += 1;
      const body = await jsonBody(request);
      const token = typeof body.token_hash === "string" ? body.token_hash : "";
      const email = welcomeTokens.get(token);
      if (body.type !== "magiclink" || !email || consumedWelcomeTokens.has(token)) {
        return respond(response, 400, { code: "otp_expired", message: "The simulated welcome link is invalid or has expired." });
      }
      consumedWelcomeTokens.add(token);
      return respond(response, 200, issueSession(userFor(email)));
    }
    if (url.pathname === "/auth/v1/token" && request.method === "POST") {
      const body = await jsonBody(request);
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const session = [...sessions.values()].find((value) => value.refreshToken === body.refresh_token);
        return session ? respond(response, 200, issueSession(session.user))
          : respond(response, 400, { code: "refresh_token_not_found", message: "Invalid fixture refresh token" });
      }
      if ((body.email !== fixture.memberEmail && body.email !== fixture.outsiderEmail) || body.password !== fixture.password) {
        return respond(response, 400, { code: "invalid_credentials", message: "Invalid login credentials" });
      }
      return respond(response, 200, issueSession(userFor(String(body.email))));
    }
    if (url.pathname === "/auth/v1/.well-known/jwks.json") return respond(response, 200, { keys: [] });
    const session = authenticated(request);
    if (!session) return respond(response, 401, { code: "bad_jwt", message: "Invalid fixture session" });
    if (url.pathname === "/auth/v1/user") return respond(response, 200, session.user);
    if (url.pathname === "/auth/v1/logout" && request.method === "POST") {
      sessions.delete(request.headers.authorization!.replace(/^Bearer /, ""));
      return respond(response, 204);
    }
    const owner = session.user.id === fixture.memberId;
    const membership = members.find((member) => member.userId === session.user.id);
    const member = owner || Boolean(membership);
    if (url.pathname === "/rest/v1/authors") {
      return respond(response, 200, member && url.searchParams.get("id") === `eq.${fixture.authorId}` ? [{ id: fixture.authorId, owner_user_id: fixture.memberId }] : []);
    }
    if (!member) return respond(response, 403, { code: "42501", message: "Fixture workspace access denied" });
    if (url.pathname === "/rest/v1/author_members") {
      if (url.searchParams.get("author_id") !== `eq.${fixture.authorId}`) return respond(response, 403, { code: "42501", message: "Fixture tenant mismatch" });
      const userFilter = url.searchParams.get("user_id");
      return respond(response, 200, members.filter((item) => !userFilter || userFilter === `eq.${item.userId}`)
        .map((item) => ({ id: item.id, author_id: fixture.authorId, user_id: item.userId, role: item.role, version: item.version, created_at: item.createdAt, updated_at: item.updatedAt })));
    }
    if (url.pathname === "/rest/v1/workspace_links") {
      if (request.method === "POST") {
        if (!owner && membership?.role !== "editor") return respond(response, 403, { code: "42501", message: "Fixture write access denied" });
        const { author_id: authorId, ...input } = await jsonBody(request);
        if (authorId !== fixture.authorId) return respond(response, 403, { code: "42501", message: "Fixture tenant mismatch" });
        const parsed = connectionInputSchema.safeParse(input);
        if (!parsed.success) return respond(response, 400, { code: "23514", message: "Invalid simulated link" });
        if (links.some((link) => link.platform === parsed.data.platform && link.url === parsed.data.url)) return respond(response, 409, { code: "23505", message: "Simulated link already saved" });
        links.unshift({ ...parsed.data, id: randomUUID(), author_id: fixture.authorId, created_by: session.user.id, created_at: new Date().toISOString(), data_origin: "manual" });
        return respond(response, 201, null);
      }
      if (url.searchParams.get("author_id") !== `eq.${fixture.authorId}`) return respond(response, 403, { code: "42501", message: "Fixture tenant mismatch" });
      if (request.method === "DELETE") {
        if (!owner && membership?.role !== "editor") return respond(response, 403, { code: "42501", message: "Fixture write access denied" });
        const target = links.find((link) => url.searchParams.get("id") === `eq.${link.id}`);
        if (target) links = links.filter((link) => link.id !== target.id);
        return respond(response, 200, target ? [{ id: target.id }] : []);
      }
      if (request.method === "GET") return respond(response, 200, links);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/") && request.method === "POST") {
      const body = await jsonBody(request);
      if (body.p_author_id !== fixture.authorId) return respond(response, 403, { code: "42501", message: "Fixture tenant mismatch" });
      const method = url.pathname.split("/").pop();
      const now = new Date().toISOString();
      if (method?.startsWith("workspace_access_")) {
        if (!owner) return respond(response, 403, { code: "42501", message: "Fixture owner access required" });
        if (method === "workspace_access_list") return respond(response, 200, { owner: { userId: fixture.memberId, email: fixture.memberEmail }, members });
        if (method === "workspace_access_grant") {
          if (body.p_role !== "viewer" && body.p_role !== "editor") return respond(response, 400, { code: "22023", message: "Invalid fixture role" });
          const email = String(body.p_email).trim().toLowerCase();
          if (email === fixture.memberEmail) return respond(response, 400, { code: "22023", message: "Fixture owner is protected" });
          if (email !== fixture.outsiderEmail) return respond(response, 404, { code: "P0002", message: "Existing confirmed fixture account unavailable" });
          const existing = members.find((item) => item.userId === fixture.outsiderId);
          if (existing && existing.role !== body.p_role) return respond(response, 409, { code: "40001", message: "Fixture access changed" });
          if (!existing) members.push({ id: randomUUID(), userId: fixture.outsiderId, email, role: body.p_role, version: 0, createdAt: now, updatedAt: now });
          return respond(response, 200, null);
        }
        const target = members.find((item) => item.id === body.p_member_id);
        if (!target) return method === "workspace_access_revoke" ? respond(response, 200, null)
          : respond(response, 404, { code: "P0002", message: "Fixture membership unavailable" });
        if (target.version !== body.p_expected_version) return respond(response, 409, { code: "40001", message: "Fixture access changed" });
        if (method === "workspace_access_change") {
          if (body.p_role !== "viewer" && body.p_role !== "editor") return respond(response, 400, { code: "22023", message: "Invalid fixture role" });
          if (target.role !== body.p_role) { target.role = body.p_role; target.version += 1; target.updatedAt = now; }
          return respond(response, 200, null);
        }
        if (method === "workspace_access_revoke") { members = members.filter((item) => item.id !== target.id); return respond(response, 200, null); }
        return respond(response, 400, { code: "42883", message: "Unsupported simulated access RPC" });
      }
      if (!owner && membership?.role !== "editor") return respond(response, 403, { code: "42501", message: "Fixture write access denied" });
      if (method === "create_manual_review") {
        const title = String(body.p_title);
        const draft = String(body.p_draft);
        const approval: ApprovalRequest = {
          id: randomUUID(), recommendation_id: null, type: "campaign", title, draft,
          description: "A member-supplied business brief for Cassandra to review. No external action is authorized.",
          status: "pending", created_at: now, updated_at: now, data_origin: "manual", version: 0,
          evidence: [{ id: randomUUID(), source_id: randomUUID(), source: "Simulated member-supplied business brief",
            source_type: "human_feedback", retrieved_at: now, excerpt_or_metric: draft,
            metadata: { simulated_browser_fixture: true, submitted_by: session.user.id }, data_origin: "manual" }],
        };
        approvals.unshift(approval);
        return respond(response, 200, approval);
      }
      const approval = approvals.find((item) => item.id === body.p_approval_id);
      if (!approval) return respond(response, 404, { code: "P0002", message: "Fixture approval not found" });
      if (method === "decide_approval") {
        if (body.p_expected_version !== approval.version || approval.status !== "pending") return respond(response, 409, { code: "40001", message: "Fixture stale approval version" });
        if (body.p_action === "edit") approval.draft = String(body.p_draft);
        else approval.status = body.p_action === "approve" ? "approved" : "rejected";
        approval.version += 1;
        approval.updated_at = now;
        return respond(response, 200, approval);
      }
      if (method === "teach_raven") {
        const lesson: HumanFeedback = { id: randomUUID(), approval_request_id: approval.id,
          feedback: String(body.p_feedback), created_at: now, data_origin: "manual",
          scope: "author_workspace", user_id: session.user.id };
        feedback.push(lesson);
        return respond(response, 200, lesson);
      }
      return respond(response, 400, { code: "42883", message: "Unsupported simulated RPC" });
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      if (url.searchParams.get("author_id") !== `eq.${fixture.authorId}`) return respond(response, 403, { code: "42501", message: "Expected explicit fixture author filter" });
      if (url.pathname === "/rest/v1/approval_requests") return respond(response, 200, approvals);
      if (url.pathname === "/rest/v1/human_feedback") return respond(response, 200, feedback);
      if (url.pathname === "/rest/v1/agent_recommendations" || url.pathname === "/rest/v1/agent_runs") return respond(response, 200, []);
      if (url.pathname === "/rest/v1/workspace_generations" || url.pathname === "/rest/v1/meta_authorizations") return respond(response, 200, []);
    }
    return respond(response, 404, { code: "fixture_not_found", message: "Unsupported simulated Supabase endpoint" });
  } catch {
    return respond(response, 500, { code: "fixture_error", message: "Simulated Supabase fixture failed" });
  }
});

server.listen(3107, "127.0.0.1", () => {
  process.stdout.write("Simulated Supabase browser fixture listening on loopback port 3107. No cloud services are used.\n");
});
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
