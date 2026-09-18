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
import { fixture } from "./fixture-data";

const signingSecret = "local-test-fixture-signing-secret-not-for-production";
const sessions = new Map<string, { user: User; refreshToken: string }>();
let approvals: ApprovalRequest[] = [];
let feedback: HumanFeedback[] = [];
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
    if (url.pathname === "/__test/reset" && request.method === "POST") {
      approvals = []; feedback = []; sessions.clear();
      return respond(response, 200, { simulated: true, reset: true });
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
    const member = session.user.id === fixture.memberId;
    if (url.pathname === "/rest/v1/authors") {
      return respond(response, 200, member && url.searchParams.get("id") === `eq.${fixture.authorId}` ? [{ id: fixture.authorId }] : []);
    }
    if (!member) return respond(response, 403, { code: "42501", message: "Fixture workspace access denied" });
    if (url.pathname.startsWith("/rest/v1/rpc/") && request.method === "POST") {
      const body = await jsonBody(request);
      if (body.p_author_id !== fixture.authorId) return respond(response, 403, { code: "42501", message: "Fixture tenant mismatch" });
      const method = url.pathname.split("/").pop();
      const now = new Date().toISOString();
      if (method === "create_manual_review") {
        const title = String(body.p_title);
        const draft = String(body.p_draft);
        const approval: ApprovalRequest = {
          id: randomUUID(), recommendation_id: null, type: "campaign", title, draft,
          description: "A member-supplied business brief for Cassandra to review. No external action is authorized.",
          status: "pending", created_at: now, updated_at: now, data_origin: "manual", version: 0,
          evidence: [{ id: randomUUID(), source_id: randomUUID(), source: "Simulated member-supplied business brief",
            source_type: "human_feedback", retrieved_at: now, excerpt_or_metric: draft,
            metadata: { simulated_browser_fixture: true, submitted_by: fixture.memberId }, data_origin: "manual" }],
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
          scope: "author_workspace", user_id: fixture.memberId };
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
