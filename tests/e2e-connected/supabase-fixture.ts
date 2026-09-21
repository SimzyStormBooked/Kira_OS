/**
 * Loopback-only simulated Supabase boundary for browser wiring tests.
 * The real app still calls Supabase Auth, PostgREST and RPC through its unchanged SDKs.
 * This is not a database/security substitute: SQL and RLS are exercised by PGlite tests.
 * No cloud calls, users, emails, paid models or external side effects occur here.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import type { ApprovalRequest, HumanFeedback } from "../../types/domain";
import { connectionInputSchema, type ConnectionLink } from "../../lib/connections/schema";
import { books as seedBooks, series as seedSeries, sources as seedSources, seedTime } from "../../lib/data/seed";
import { libraryInputSchema, type LibraryMetadata } from "../../lib/manuscripts/library-contract";
import { manuscriptChunkSchema, manuscriptFormat, validateManuscriptExtraction, type ManuscriptChunk, type ManuscriptExtraction } from "../../lib/manuscripts/contract";
import { adsSnapshotSchema } from "../../lib/ads/contract";
import { fixture } from "./fixture-data";

const signingSecret = "local-test-fixture-signing-secret-not-for-production";
type AuthenticationMethod = "password" | "otp";
const sessions = new Map<string, { user: User; refreshToken: string; method: AuthenticationMethod; authenticatedAt: number }>();
const passwords = new Map<string, string>([
  [fixture.memberEmail, fixture.password],
  [fixture.outsiderEmail, fixture.password],
]);
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
// These rows simulate PostgREST transport only; the migration tests prove the real RLS/RPC boundaries.
type FixtureBook = { id: string; author_id: string; slug: string; title: string; series_id: string | null; series_order: number | null; source_id: string; overview: string | null; metadata: LibraryMetadata; verified_at: string | null; verification_status: string; data_origin: "manual" | "public_verified"; active_manuscript_id: string | null; created_at: string; updated_at: string };
type FixtureSource = { id: string; author_id: string; name: string; url: string | null; source_type: string; retrieved_at: string; data_origin: string; metadata: Record<string, unknown> };
type FixtureSeries = { id: string; author_id: string; name: string; data_origin: string };
type FixtureManuscript = { id: string; author_id: string; book_id: string; source_id: string; asset_id: string; filename: string; mime_type: string; size_bytes: number; content_hash: string; version: number; storage_path: string; permission_granted_by: string; permission_granted_at: string; permission_scope: string; status: "uploading" | "queued" | "processing" | "ready" | "failed"; error_code: string | null; chunk_count: number; completed_chunks: number; parser_version: string; created_at: string; updated_at: string };
type FixtureChunk = ManuscriptChunk & { author_id: string; manuscript_id: string; source_id: string; asset_id: string };
type FixtureBatch = { id: string; author_id: string; manuscript_id: string; created_by: string; chunk_ids: string[]; status: "pending" | "complete" | "failed"; model: string; result: ManuscriptExtraction | null; error_code: string | null; created_at: string; completed_at: string | null };
type FixtureIntelligence = { id: string; author_id: string; book_id: string; manuscript_id: string; profile: ManuscriptExtraction; extracted_at: string; model: string; review_status: string };
let libraryBooks: FixtureBook[] = [];
let librarySources: FixtureSource[] = [];
let librarySeries: FixtureSeries[] = [];
let manuscripts: FixtureManuscript[] = [];
let manuscriptChunks: FixtureChunk[] = [];
let manuscriptBatches: FixtureBatch[] = [];
let intelligence: FixtureIntelligence[] = [];
let adsReports: Array<{id:string;author_id:string;account_id:string;created_at:string;snapshot:unknown}> = [];
let adsInspiration: Array<{id:string;author_id:string;title:string;url:string;note:string;created_at:string}> = [];
const storedFiles = new Map<string, Buffer>();
const fixtureRecordingKey = "a".repeat(64);
const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
function resetLibrary() {
  libraryBooks = seedBooks.map(book => ({ ...book, author_id: fixture.authorId, overview: null, metadata: {}, active_manuscript_id: null, created_at: seedTime, updated_at: seedTime }));
  librarySeries = seedSeries.map(item => ({ ...item, author_id: fixture.authorId }));
  librarySources = seedSources.filter(item => item.data_origin !== "demo").map(item => ({ ...item, author_id: fixture.authorId, metadata: {} }));
  manuscripts = []; manuscriptChunks = []; manuscriptBatches = []; intelligence = []; adsReports = []; adsInspiration = []; storedFiles.clear();
}
resetLibrary();
function newManuscript(book: FixtureBook, input: { id: string; filename: string; mime: string; bytes: number; hash: string }, actor: string): FixtureManuscript {
  const now = new Date().toISOString();
  const row: FixtureManuscript = {
    id: input.id, author_id: fixture.authorId, book_id: book.id, source_id: randomUUID(), asset_id: randomUUID(),
    filename: input.filename, mime_type: input.mime, size_bytes: input.bytes, content_hash: input.hash,
    version: Math.max(0, ...manuscripts.filter(item => item.book_id === book.id).map(item => item.version)) + 1,
    storage_path: `${fixture.authorId}/${book.id}/${input.id}.${manuscriptFormat(input.filename, input.mime)}`,
    permission_granted_by: actor, permission_granted_at: now, permission_scope: "private_reference_analysis",
    status: "uploading", error_code: null, chunk_count: 0, completed_chunks: 0, parser_version: "kira-text-v1", created_at: now, updated_at: now,
  };
  manuscripts.push(row);
  librarySources.push({ id: row.source_id, author_id: fixture.authorId, name: `Simulated private manuscript: ${row.filename}`, url: null, source_type: "document", retrieved_at: now, data_origin: "manual", metadata: { permission_scope: row.permission_scope, manuscript_id: row.id, book_id: row.book_id, content_hash: row.content_hash, simulated_browser_fixture: true } });
  return row;
}
function completeManuscript(row: FixtureManuscript, profile: ManuscriptExtraction, model: string) {
  const now = new Date().toISOString();
  const record: FixtureIntelligence = { id: randomUUID(), author_id: fixture.authorId, book_id: row.book_id, manuscript_id: row.id, profile, extracted_at: now, model, review_status: "unreviewed" };
  intelligence = [...intelligence.filter(item => item.manuscript_id !== row.id), record];
  row.status = "ready"; row.completed_chunks = row.chunk_count; row.error_code = null; row.updated_at = now;
  const book = libraryBooks.find(item => item.id === row.book_id)!;
  const active = manuscripts.find(item => item.id === book.active_manuscript_id);
  if (!active || active.version <= row.version) { book.active_manuscript_id = row.id; book.updated_at = now; }
  return record;
}
function respondRows(request: IncomingMessage, response: ServerResponse, url: URL, rows: object[]) {
  let filtered = rows.filter(row => [...url.searchParams].every(([key, filter]) => {
    const value = (row as Record<string, unknown>)[key];
    if (["select", "order", "limit", "offset"].includes(key)) return true;
    if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
    if (filter.startsWith("neq.")) return String(value) !== filter.slice(4);
    if (filter.startsWith("in.(")) return filter.slice(4, -1).split(",").includes(String(value));
    return false;
  }));
  const order = url.searchParams.get("order")?.split(".");
  if (order) filtered = [...filtered].sort((a, b) => {
    const left = (a as Record<string, unknown>)[order[0]];
    const right = (b as Record<string, unknown>)[order[0]];
    const compared = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return order[1] === "desc" ? -compared : compared;
  });
  if (url.searchParams.has("limit")) filtered = filtered.slice(0, Number(url.searchParams.get("limit")));
  if (request.headers.accept?.includes("application/vnd.pgrst.object+json")) {
    return filtered.length === 1 ? respond(response, 200, filtered[0]) : respond(response, 406, { code: "PGRST116", details: `The result contains ${filtered.length} rows`, message: "JSON object requested, multiple (or no) rows returned" });
  }
  return respond(response, 200, filtered);
}
const userFor = (email: string): User => ({
  id: email === fixture.memberEmail ? fixture.memberId : fixture.outsiderId,
  aud: "authenticated", role: "authenticated", email,
  email_confirmed_at: "2026-01-01T00:00:00.000Z", phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00.000Z", is_anonymous: false,
});
function issueSession(user: User, method: AuthenticationMethod = "password", authenticatedAt = Math.floor(Date.now() / 1000)) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email, aud: "authenticated", role: "authenticated",
    iss: `${fixture.supabaseUrl}/auth/v1`, iat: now, exp: now + 3600,
    session_id: randomUUID(), aal: "aal1", is_anonymous: false,
    amr: [{ method, timestamp: authenticatedAt }],
  })).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(`${header}.${payload}`).digest("base64url");
  const accessToken = `${header}.${payload}.${signature}`;
  const refreshToken = randomUUID();
  sessions.set(accessToken, { user, refreshToken, method, authenticatedAt });
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
    if (Buffer.byteLength(body) > 3000000) throw new Error("Fixture body limit exceeded");
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
      passwords.set(fixture.memberEmail, fixture.password); passwords.set(fixture.outsiderEmail, fixture.password);
      resetLibrary();
      return respond(response, 200, { simulated: true, reset: true });
    }
    if (url.pathname === "/__test/manuscripts" && request.method === "POST") {
      const body = await jsonBody(request);
      const book = libraryBooks.find(item => item.id === body.bookId);
      if (!book) return respond(response, 404, { message: "Simulated book not found" });
      let manuscript = manuscripts.find(item => item.id === body.manuscriptId && item.book_id === book.id);
      if (body.manuscriptId && !manuscript) return respond(response, 404, { message: "Simulated manuscript not found" });
      if (!manuscript) {
        const text = typeof body.text === "string" ? body.text : "Synthetic browser reference: Rowan is a named character. Found family is discussed in this simulated passage. The final revelation is a fixture spoiler.";
        if (!text.trim() || text.length > 4000) return respond(response, 400, { message: "Synthetic passage must be 1–4000 characters" });
        manuscript = newManuscript(book, { id: randomUUID(), filename: "simulated-reference.txt", mime: "text/plain", bytes: Buffer.byteLength(text), hash: sha256(text) }, fixture.memberId);
        manuscript.chunk_count = 1;
        manuscriptChunks.push({ id: randomUUID(), author_id: fixture.authorId, manuscript_id: manuscript.id, source_id: manuscript.source_id, asset_id: manuscript.asset_id, chunk_index: 0, section: "Synthetic passage 1", reference_text: text, content_hash: sha256(text) });
        storedFiles.set(manuscript.storage_path, Buffer.from(text));
      }
      const chunks = manuscriptChunks.filter(item => item.manuscript_id === manuscript.id);
      if (!chunks.length) return respond(response, 409, { message: "Upload chunks before injecting ready intelligence" });
      const citation = { chunk_id: chunks[0].id, quote: chunks[0].reference_text.trim().slice(0, 180) };
      const profile = validateManuscriptExtraction({
        facts: [
          { category: "theme", statement: "Synthetic supported theme for the browser fixture.", kind: "supported", spoiler: false, citations: [citation] },
          { category: "marketing_hook", statement: "Synthetic marketing possibility; requires author review.", kind: "inference", spoiler: false, citations: [citation] },
          { category: "plot", statement: "Synthetic spoiler detail for reveal-control verification.", kind: "supported", spoiler: true, citations: [citation] },
        ],
        characters: [{ name: "Rowan", aliases: ["Coordinator"], role: "Synthetic reference character", description: "Simulated character observation for the browser fixture.", personality: "", relationships: "", arc: "", marketing_description: "", spoiler: false, citations: [citation] }, { name: "Rowan", aliases: [], role: "Coordinator", description: "A second synthetic observation of the same character.", personality: "Careful", relationships: "", arc: "", marketing_description: "", spoiler: false, citations: [citation] }],
      }, chunks);
      const record = completeManuscript(manuscript, profile, "simulated-browser-fixture");
      return respond(response, 200, { book, manuscript, chunks, intelligence: record });
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
      return respond(response, 200, issueSession(userFor(email), "otp"));
    }
    if (url.pathname === "/auth/v1/token" && request.method === "POST") {
      const body = await jsonBody(request);
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const session = [...sessions.values()].find((value) => value.refreshToken === body.refresh_token);
        // Refresh must not make old authentication proof recent again.
        return session ? respond(response, 200, issueSession(session.user, session.method, session.authenticatedAt))
          : respond(response, 400, { code: "refresh_token_not_found", message: "Invalid fixture refresh token" });
      }
      if ((body.email !== fixture.memberEmail && body.email !== fixture.outsiderEmail) || body.password !== passwords.get(String(body.email))) {
        return respond(response, 400, { code: "invalid_credentials", message: "Invalid login credentials" });
      }
      return respond(response, 200, issueSession(userFor(String(body.email))));
    }
    if (url.pathname === "/auth/v1/.well-known/jwks.json") return respond(response, 200, { keys: [] });
    const session = authenticated(request);
    if (!session) return respond(response, 401, { code: "bad_jwt", message: "Invalid fixture session" });
    if (url.pathname === "/auth/v1/user" && request.method === "PUT") {
      const body = await jsonBody(request);
      if (!session.user.email || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) {
        return respond(response, 400, { code: "weak_password", message: "Invalid simulated password update" });
      }
      passwords.set(session.user.email, body.password);
      return respond(response, 200, session.user);
    }
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
    if (url.pathname.startsWith("/storage/v1/object/")) {
      const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(?:authenticated\/)?kira-manuscripts\//, ""));
      const row = manuscripts.find(item => item.storage_path === path);
      if (!row) return respond(response, 404, { statusCode: "404", message: "Simulated private file unavailable" });
      if (request.method === "POST") {
        if ((!owner && membership?.role !== "editor") || row.permission_granted_by !== session.user.id || row.status !== "uploading") return respond(response, 403, { statusCode: "403", message: "Simulated upload permission denied" });
        if (request.headers["x-upsert"] === "true" || storedFiles.has(path)) return respond(response, 409, { statusCode: "409", error: "Duplicate", message: "Simulated object already exists" });
        const parts: Buffer[] = [];
        let size = 0;
        for await (const part of request) {
          const bytes = Buffer.from(part); size += bytes.length;
          if (size > 4194304) return respond(response, 413, { message: "Simulated file limit exceeded" });
          parts.push(bytes);
        }
        const bytes = Buffer.concat(parts);
        if (bytes.length !== row.size_bytes || sha256(bytes) !== row.content_hash) return respond(response, 400, { message: "Simulated registered file mismatch" });
        storedFiles.set(path, bytes);
        return respond(response, 200, { Id: randomUUID(), Key: `kira-manuscripts/${path}` });
      }
      if (request.method === "GET" && storedFiles.has(path)) {
        response.writeHead(200, { "Content-Type": row.mime_type, "Cache-Control": "no-store" });
        return response.end(storedFiles.get(path));
      }
      return respond(response, 403, { statusCode: "403", message: "Simulated object cannot be overwritten or deleted" });
    }
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
      if (method === "ads_control") {
        if (body.p_key !== fixtureRecordingKey) return respond(response,403,{code:"42501"});
        if (body.p_action === "view") return respond(response,200,null);
        const payload=body.p_payload as Record<string,unknown>;
        if (body.p_action === "import") { const snapshot=adsSnapshotSchema.parse(payload.snapshot); const id=randomUUID(); adsReports.unshift({id,author_id:fixture.authorId,account_id:snapshot.account.id,created_at:now,snapshot}); return respond(response,200,{id}); }
        if (body.p_action === "inspiration") { adsInspiration.unshift({id:randomUUID(),author_id:fixture.authorId,title:String(payload.title),url:String(payload.url),note:String(payload.note),created_at:now}); return respond(response,200,{}); }
        if (body.p_action === "remove_inspiration") { adsInspiration=adsInspiration.filter(i=>i.id!==payload.id);return respond(response,200,{}); }
        return respond(response,400,{code:"22023"});
      }
      if (method === "manuscript_search") {
        const query = String(body.p_query ?? "").trim().toLowerCase();
        if (query.length < 2 || query.length > 500) return respond(response, 400, { code: "22023", message: "Invalid simulated search" });
        const terms = query.split(/\s+/);
        const results = manuscriptChunks.flatMap(chunk => {
          const manuscript = manuscripts.find(item => item.id === chunk.manuscript_id);
          const book = libraryBooks.find(item => item.id === manuscript?.book_id);
          if (!book || manuscript?.status !== "ready" || book.active_manuscript_id !== manuscript.id || (body.p_book_id && body.p_book_id !== book.id)) return [];
          if (!terms.every(term => chunk.reference_text.toLowerCase().includes(term))) return [];
          return [{ book_id: book.id, book_title: book.title, manuscript_id: manuscript.id, chunk_id: chunk.id, location: chunk.section, excerpt: chunk.reference_text.slice(0, 1000), score: 1 }];
        }).slice(0, Math.min(20, Number(body.p_limit) || 8));
        return respond(response, 200, results);
      }
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
      if (method === "library_save_book") {
        const parsed = libraryInputSchema.safeParse({ title: body.p_title, seriesId: body.p_series_id ?? null, ...(body.p_series_name ? { seriesName: body.p_series_name } : {}), seriesOrder: body.p_series_order ?? null, overview: body.p_overview ?? null, metadata: body.p_metadata ?? {} });
        if (!parsed.success) return respond(response, 400, { code: "22023", message: "Invalid simulated book details" });
        const input = parsed.data;
        let seriesId = input.seriesId;
        if (seriesId && !librarySeries.some(item => item.id === seriesId)) return respond(response, 403, { code: "42501", message: "Simulated series belongs to another workspace" });
        let book = libraryBooks.find(item => item.id === body.p_book_id);
        if (body.p_book_id && !book) return respond(response, 404, { code: "P0002", message: "Simulated book unavailable" });
        if (book && book.updated_at !== body.p_expected_updated_at) return respond(response, 409, { code: "40001", message: "Simulated book changed" });
        if (input.seriesName) {
          let series = librarySeries.find(item => item.name.toLowerCase() === input.seriesName!.toLowerCase());
          if (!series) { series = { id: randomUUID(), author_id: fixture.authorId, name: input.seriesName, data_origin: "manual" }; librarySeries.push(series); }
          seriesId = series.id;
        }
        const sourceId = randomUUID();
        librarySources.push({ id: sourceId, author_id: fixture.authorId, name: "Simulated member-supplied catalog details", url: null, source_type: "human_feedback", retrieved_at: now, data_origin: "manual", metadata: { submitted_by: session.user.id, simulated_browser_fixture: true } });
        if (!book) {
          const id = randomUUID();
          book = { id, author_id: fixture.authorId, slug: `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "book"}-${id.slice(0, 8)}`, title: input.title, series_id: seriesId, series_order: input.seriesOrder, source_id: sourceId, overview: input.overview, metadata: input.metadata, verified_at: null, verification_status: "unverified", data_origin: "manual", active_manuscript_id: null, created_at: now, updated_at: now };
          libraryBooks.push(book);
        } else {
          const updatedAt = new Date(Math.max(Date.now(), new Date(book.updated_at).getTime() + 1)).toISOString();
          Object.assign(book, { title: input.title, series_id: seriesId, series_order: input.seriesOrder, source_id: sourceId, overview: input.overview, metadata: input.metadata, verified_at: null, verification_status: "unverified", data_origin: "manual", updated_at: updatedAt });
        }
        return respond(response, 200, book);
      }
      if (method?.startsWith("manuscript_")) {
        if (body.p_recording_key !== fixtureRecordingKey) return respond(response, 403, { code: "42501", message: "Simulated server recording key required" });
        if (method === "manuscript_register") {
          const book = libraryBooks.find(item => item.id === body.p_book_id);
          if (!book) return respond(response, 404, { code: "P0002", message: "Simulated book unavailable" });
          const format = manuscriptFormat(String(body.p_filename), String(body.p_mime_type));
          if (!format || typeof body.p_size_bytes !== "number" || body.p_size_bytes < 1 || body.p_size_bytes > 4194304 || typeof body.p_content_hash !== "string" || !/^[a-f0-9]{64}$/.test(body.p_content_hash) || typeof body.p_id !== "string") return respond(response, 400, { code: "22023", message: "Invalid simulated manuscript" });
          const reusedId = manuscripts.find(item => item.id === body.p_id);
          if (reusedId && (reusedId.book_id !== book.id || reusedId.content_hash !== body.p_content_hash || reusedId.permission_granted_by !== session.user.id)) return respond(response, 409, { code: "40001", message: "Simulated manuscript identity conflict" });
          const duplicate = manuscripts.find(item => item.book_id === book.id && item.content_hash === body.p_content_hash);
          if (duplicate) {
            if (duplicate.status === "failed" && duplicate.error_code === "storage_error" && duplicate.chunk_count === 0 && duplicate.permission_granted_by === session.user.id) { duplicate.status = "uploading"; duplicate.error_code = null; }
            return respond(response, 200, duplicate);
          }
          return respond(response, 200, newManuscript(book, { id: body.p_id, filename: String(body.p_filename), mime: String(body.p_mime_type), bytes: body.p_size_bytes, hash: body.p_content_hash }, session.user.id));
        }
        const row = manuscripts.find(item => item.id === body.p_id);
        if (!row) return respond(response, 404, { code: "P0002", message: "Simulated manuscript unavailable" });
        if (method === "manuscript_store_chunks") {
          if (row.permission_granted_by !== session.user.id) return respond(response, 403, { code: "42501", message: "Simulated uploader required" });
          const parsed = manuscriptChunkSchema.array().min(1).max(500).safeParse(body.p_chunks);
          if (!parsed.success || parsed.data.some((chunk, index) => chunk.chunk_index !== index || chunk.content_hash !== sha256(chunk.reference_text))) return respond(response, 400, { code: "22023", message: "Invalid simulated chunks" });
          const existing = manuscriptChunks.filter(item => item.manuscript_id === row.id);
          if (row.status !== "uploading") {
            const same = existing.length === parsed.data.length && existing.every((chunk, index) => Object.entries(parsed.data[index]).every(([key, value]) => chunk[key as keyof FixtureChunk] === value));
            return same ? respond(response, 200, row) : respond(response, 409, { code: "40001", message: "Simulated chunks are immutable" });
          }
          manuscriptChunks.push(...parsed.data.map(chunk => ({ ...chunk, author_id: fixture.authorId, manuscript_id: row.id, source_id: row.source_id, asset_id: row.asset_id })));
          row.chunk_count = parsed.data.length; row.status = "queued"; row.updated_at = now;
          return respond(response, 200, row);
        }
        if (method === "manuscript_fail_upload") {
          if (row.permission_granted_by !== session.user.id || body.p_error_code !== "storage_error") return respond(response, 403, { code: "42501", message: "Simulated uploader required" });
          if (row.status === "uploading") { row.status = "failed"; row.error_code = "storage_error"; row.updated_at = now; }
          return respond(response, 200, row);
        }
        if (method === "manuscript_begin_batch") {
          const reused = manuscriptBatches.find(item => item.id === body.p_request_id);
          if (reused) return reused.manuscript_id === row.id && reused.created_by === session.user.id ? respond(response, 200, { created: false, batch: reused, chunks: [] }) : respond(response, 409, { code: "40001", message: "Simulated request identity conflict" });
          if (row.status === "ready") return respond(response, 200, { created: false, batch: null, chunks: [] });
          const pending = manuscriptBatches.find(item => item.manuscript_id === row.id && item.status === "pending");
          if (pending) {
            if (Date.now() - new Date(pending.created_at).getTime() < 120000) return respond(response, 200, { created: false, batch: pending, chunks: [] });
            if (body.p_retry !== true) return respond(response, 409, { code: "55P03", message: "Simulated interrupted step requires retry" });
            pending.status = "failed"; pending.error_code = "interrupted"; pending.completed_at = now;
          }
          if (row.status === "failed" && body.p_retry !== true) return respond(response, 409, { code: "55P03", message: "Simulated failure requires retry" });
          const completed = new Set(manuscriptBatches.filter(item => item.manuscript_id === row.id && item.status === "complete").flatMap(item => item.chunk_ids));
          const chunks = manuscriptChunks.filter(item => item.manuscript_id === row.id && !completed.has(item.id)).sort((a, b) => a.chunk_index - b.chunk_index).slice(0, 4);
          if (!chunks.length || typeof body.p_request_id !== "string") return respond(response, 400, { code: "22023", message: "Simulated manuscript has no readable chunks" });
          const batch: FixtureBatch = { id: body.p_request_id, author_id: fixture.authorId, manuscript_id: row.id, created_by: session.user.id, chunk_ids: chunks.map(chunk => chunk.id), status: "pending", model: "simulated-browser-fixture", result: null, error_code: null, created_at: now, completed_at: null };
          manuscriptBatches.push(batch); row.status = "processing"; row.error_code = null;
          return respond(response, 200, { created: true, batch, chunks });
        }
        if (method === "manuscript_finish_batch") {
          const batch = manuscriptBatches.find(item => item.id === body.p_request_id && item.manuscript_id === row.id);
          if (!batch || batch.created_by !== session.user.id) return respond(response, 403, { code: "42501", message: "Simulated batch actor required" });
          if (batch.status !== "pending") return respond(response, 200, { batch, manuscript: row });
          if (body.p_error_code) {
            batch.status = "failed"; batch.error_code = String(body.p_error_code); row.status = "failed"; row.error_code = batch.error_code;
          } else {
            try { batch.result = validateManuscriptExtraction(body.p_result, manuscriptChunks.filter(chunk => batch.chunk_ids.includes(chunk.id) && chunk.manuscript_id === row.id)); }
            catch { return respond(response, 400, { code: "22023", message: "Invalid simulated evidence" }); }
            batch.status = "complete";
            const complete = manuscriptBatches.filter(item => item.manuscript_id === row.id && item.status === "complete");
            row.completed_chunks = new Set(complete.flatMap(item => item.chunk_ids)).size;
            if (row.completed_chunks === row.chunk_count) completeManuscript(row, { facts: complete.flatMap(item => item.result?.facts ?? []), characters: complete.flatMap(item => item.result?.characters ?? []) }, "simulated-browser-fixture");
          }
          batch.completed_at = now;
          return respond(response, 200, { batch, manuscript: row });
        }
        return respond(response, 400, { code: "42883", message: "Unsupported simulated manuscript RPC" });
      }
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
      const libraryTables: Record<string, object[]> = { ads_reports: adsReports, ads_jobs: [], ads_subscriptions: [], ads_book_links: [], ads_deliveries: [], ads_inspiration: adsInspiration, books: libraryBooks, series: librarySeries, sources: librarySources, manuscripts, knowledge_chunks: manuscriptChunks, manuscript_batches: manuscriptBatches, book_intelligence: intelligence };
      const table = libraryTables[url.pathname.slice("/rest/v1/".length)];
      if (table) return request.method === "GET" ? respondRows(request, response, url, table) : respond(response, 403, { code: "42501", message: "Simulated library writes require scoped RPCs" });
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
