import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const owner = randomUUID(), editor = randomUUID(), viewer = randomUUID(), outsider = randomUUID();
const author = randomUUID(), other = randomUUID(), book = randomUUID(), otherBook = randomUUID();
const key = "a".repeat(64); // Capability only for this isolated test database.
const state = "b".repeat(64), ciphertext = "encrypted-credential-test-value";
const property = "https://author.example.com/";
type Result = Record<string, unknown>;

async function asUser(user: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${role}`);
}
async function call<T = Result>(action: string, payload: unknown = {}, tenant = author, secret: string | null = key, google = false) {
  const rpc = google ? "discovery_google_control" : "discovery_control";
  return (await db.query<{ value: T }>(`select public.${rpc}($1,$2,$3,$4) as value`, [tenant, action, JSON.stringify(payload), secret])).rows[0].value;
}
const oauth = (action: string, payload: unknown = {}, tenant = author, secret: string | null = key) => call(action, payload, tenant, secret, true);
async function worker(action: string, id: string, run: string | null = "run-one", payload: unknown = {}, secret: string | null = key) {
  await asUser("", "anon");
  return (await db.query<{ value: Result | null }>("select public.discovery_worker($1,$2,$3,$4,$5) as value", [action, id, run, JSON.stringify(payload), secret])).rows[0].value;
}
async function page(tenant = author, bookId: string | null = book) {
  return call<{ id: string }>("page", { url: `https://author.example.com/${randomUUID()}`, label: "Book page", bookId, kind: "book" }, tenant);
}
async function connect(user = editor) {
  await asUser(user);
  await oauth("begin", { hash: state });
  await oauth("consume", { hash: state });
  await oauth("connect", { hash: state, ciphertext, properties: [{ siteUrl: property, permissionLevel: "siteOwner" }, { siteUrl: "sc-domain:author.example.com", permissionLevel: "siteFullUser" }] });
  await oauth("select", { property });
}
const snapshot = (origin = "manual_snapshot", fetchedAt = "2026-09-23T12:00:00Z") => ({
  data_origin: origin, property, dimension: "date", since: "2026-09-01", until: "2026-09-20", fetchedAt,
  rows: [{ key: "2026-09-01", clicks: 2, impressions: 10, ctr: 0.2, position: 3 }],
  totals: { clicks: 2, impressions: 10, ctr: 0.2, position: 3 }, warning: "Imported snapshot; not a live feed.",
});
const listing = { bookId: book, amazonUrl: "https://www.amazon.com/dp/B012345678", edition: "Paperback", description: "Author supplied listing text.", keywords: ["urban fantasy"], categories: ["Fantasy"], status: "draft", expectedVersion: null };

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for (const name of ["202609170001_foundation", "20260918003251_workspace_generations", "202609230002_discovery_workspace"]) {
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  }
  await db.query("insert into private.workspace_generation_config(singleton,recording_key_hash) values(true,encode(sha256(convert_to($1,'UTF8')),'hex'))", [key]);
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [owner, editor, viewer, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other author','manual')", [author, owner, other, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')", [author, editor, viewer]);
  for (const [tenant, bookId] of [[author, book], [other, otherBook]]) {
    const source = randomUUID();
    await db.query("insert into public.sources(id,author_id,name,source_type,retrieved_at,data_origin) values($1,$2,'Author input','document',now(),'manual')", [source, tenant]);
    await db.query("insert into public.books(id,author_id,source_id,slug,title,data_origin) values($1,$2,$3,'book','The Book','manual')", [bookId, tenant, source]);
  }
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.discovery_pages,public.discovery_listings,public.discovery_reports,public.discovery_actions,public.discovery_jobs,private.discovery_google,private.discovery_oauth cascade");
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor') on conflict(author_id,user_id) do update set role='editor'", [author, editor]);
  await asUser(owner);
});
afterAll(() => db.close());

describe("discovery workspace isolation", () => {
  it("requires capability and editing access; private credentials never enter the view", async () => {
    await connect();
    const stored = await page();
    expect(JSON.stringify(await call("view"))).not.toContain(ciphertext);
    await asUser(viewer);
    expect(await call("view")).toMatchObject({ canEdit: false, pages: [{ id: stored.id }] });
    expect((await db.query("select id from public.discovery_pages")).rows).toEqual([{ id: stored.id }]);
    for (const action of ["page", "action", "audit", "listing"]) await expect(call(action)).rejects.toMatchObject({ code: "42501" });
    await expect(oauth("disconnect")).rejects.toMatchObject({ code: "42501" });
    await asUser(outsider);
    expect((await db.query("select id from public.discovery_pages")).rows).toEqual([]);
    await expect(call("view")).rejects.toMatchObject({ code: "42501" });
    await asUser(owner);
    for (const secret of [null, "", "b".repeat(64)]) {
      await expect(call("view", {}, author, secret)).rejects.toMatchObject({ code: "42501" });
      await expect(oauth("begin", { hash: state }, author, secret)).rejects.toMatchObject({ code: "42501" });
      await expect(worker("claim", randomUUID(), "run", {}, secret)).rejects.toMatchObject({ code: "42501" });
      await asUser(owner);
    }
    await expect(db.query("select * from private.discovery_google")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select * from private.discovery_oauth")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("update public.discovery_pages set label='Forged'")).rejects.toMatchObject({ code: "42501" });
    await asUser("", "anon");
    await expect(call("view")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select * from public.discovery_pages")).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects cross-author pages, books, listing links and action edits", async () => {
    await asUser(outsider);
    const foreignPage = await page(other, otherBook);
    const foreignAction = await call<{ id: string }>("action", { pageId: foreignPage.id, bookId: otherBook, title: "Private", detail: "Other author action" }, other);
    await asUser(owner);
    await expect(page(author, otherBook)).rejects.toMatchObject({ code: "42501" });
    await expect(call("listing", { ...listing, bookId: otherBook })).rejects.toMatchObject({ code: "42501" });
    await expect(call("action", { pageId: foreignPage.id, title: "Forged", detail: "Foreign page" })).rejects.toMatchObject({ code: "42501" });
    await expect(call("audit", { pageId: foreignPage.id })).rejects.toMatchObject({ code: "42501" });
    await expect(call("remove_page", { id: foreignPage.id })).rejects.toMatchObject({ code: "P0002" });
    await expect(call("action_status", { id: foreignAction.id, status: "applied" })).rejects.toMatchObject({ code: "P0002" });
  });

  it("keeps listing edits versioned and refuses stale saves", async () => {
    const saved = await call<{ id: string }>("listing", listing);
    await expect(call("listing", { ...listing, description: "Stale create" })).rejects.toMatchObject({ code: "40001" });
    await expect(call("listing", { ...listing, expectedVersion: 10 })).rejects.toMatchObject({ code: "40001" });
    await asUser(editor);
    expect(await call("listing", { ...listing, expectedVersion: 0, description: "Revised by editor" })).toEqual(saved);
    await asUser(owner);
    await expect(call("listing", { ...listing, expectedVersion: 0 })).rejects.toMatchObject({ code: "40001" });
    expect((await db.query("select description,version from public.discovery_listings")).rows).toEqual([{ description: "Revised by editor", version: 1 }]);
  });

  it("enforces tenant foreign keys even for administrative imports and preserves actions when a page is removed", async () => {
    const saved = await page();
    await call("action", { pageId: saved.id, bookId: book, title: "Improve the page title", detail: "Review the title with the author." });
    await db.exec("reset role");
    await expect(db.query("insert into public.discovery_pages(author_id,url,label,book_id,kind) values($1,'https://author.example.com/foreign','Foreign',$2,'book')", [author, otherBook])).rejects.toMatchObject({ code: "23503" });
    await expect(db.query("insert into public.discovery_actions(author_id,page_id,title,detail) values($1,$2,'Foreign','Foreign page')", [other, saved.id])).rejects.toMatchObject({ code: "23503" });
    await asUser(owner);
    await call("remove_page", { id: saved.id });
    expect((await db.query("select author_id,page_id,book_id from public.discovery_actions")).rows).toEqual([{ author_id: author, page_id: null, book_id: book }]);
  });

  it("deduplicates repeated CSV imports without mistaking a manual report for Google data", async () => {
    await call("search", { snapshot: snapshot() });
    await call("search", { snapshot: snapshot("manual_snapshot", "2026-09-24T12:00:00Z") });
    await expect(call("search", { snapshot: snapshot("google_api") })).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select id from public.discovery_reports")).rows).toHaveLength(1);
    await expect(db.query("update public.discovery_reports set snapshot='{}'")).rejects.toMatchObject({ code: "42501" });
    await asUser(outsider);
    expect((await db.query("select id from public.discovery_reports")).rows).toEqual([]);
  });
});

describe("Google consent and background discovery", () => {
  it("binds a short-lived state to one actor and consumes it once before connecting", async () => {
    await oauth("begin", { hash: state });
    await expect(oauth("connect", { hash: state, ciphertext, properties: [] })).rejects.toMatchObject({ code: "22023" });
    await asUser(editor);
    await expect(oauth("consume", { hash: state })).rejects.toMatchObject({ code: "22023" });
    await asUser(owner);
    await oauth("consume", { hash: state });
    await expect(oauth("consume", { hash: state })).rejects.toMatchObject({ code: "22023" });
    await oauth("connect", { hash: state, ciphertext, properties: [] });
    await expect(oauth("connect", { hash: state, ciphertext, properties: [] })).rejects.toMatchObject({ code: "22023" });
    await oauth("begin", { hash: state });
    await db.exec("reset role; update private.discovery_oauth set created_at=now()-interval '11 minutes'");
    await asUser(owner);
    await expect(oauth("consume", { hash: state })).rejects.toMatchObject({ code: "22023" });
    await expect(oauth("select", { property })).rejects.toMatchObject({ code: "22023" });
  });

  it("reuses queued work, binds one worker run and ignores replayed completions", async () => {
    const saved = await page();
    const job = await call<{ id: string }>("audit", { pageId: saved.id });
    expect(await call("audit", { pageId: saved.id })).toMatchObject({ id: job.id });
    expect(await worker("claim", job.id, null)).toBeNull();
    expect(await worker("claim", job.id)).toMatchObject({ kind: "audit", authorId: author });
    expect(await worker("claim", job.id, "run-two")).toBeNull();
    expect(await worker("finish", job.id, "run-two", { audit: { findings: [] } })).toBeNull();
    await worker("finish", job.id, "run-one", { audit: { findings: [], title: "Verified page title" } });
    expect(await worker("finish", job.id, "run-one", { audit: { findings: [], title: "Replay" } })).toBeNull();
    await asUser(owner);
    expect((await db.query("select audit->>'title' as title from public.discovery_pages")).rows).toEqual([{ title: "Verified page title" }]);
    await expect(call("audit", { pageId: saved.id })).rejects.toMatchObject({ code: "55P03" });
  });

  it("closes abandoned work before retry and enforces the shared daily request budget", async () => {
    const saved = await page();
    const old = await call<{ id: string }>("audit", { pageId: saved.id });
    await db.exec("reset role; update public.discovery_jobs set created_at=now()-interval '11 minutes'");
    await asUser(owner);
    const next = await call<{ id: string }>("audit", { pageId: saved.id });
    expect(next.id).not.toBe(old.id);
    expect((await db.query("select state,error from public.discovery_jobs where id=$1", [old.id])).rows).toEqual([{ state: "failed", error: "interrupted" }]);
    await db.exec("reset role");
    await db.query("insert into public.discovery_jobs(author_id,actor_id,kind,state,created_at) select $1,$2,'audit','failed',now()-interval '2 minutes' from generate_series(1,38)", [author, owner]);
    await asUser(owner);
    await expect(call("audit", { pageId: (await page()).id })).rejects.toMatchObject({ code: "55P03" });
  });

  it("cancels in-flight search on disconnect and retains only manually imported snapshots", async () => {
    await connect();
    await call("search", { snapshot: snapshot() });
    const first = await call<{ id: string }>("sync");
    expect(await worker("claim", first.id)).toMatchObject({ ciphertext, actorId: editor, property });
    await worker("finish", first.id, "run-one", { snapshot: snapshot("google_api") });
    await db.exec("reset role; update public.discovery_jobs set created_at=now()-interval '2 minutes'");
    await asUser(editor);
    const next = await call<{ id: string }>("sync");
    await worker("claim", next.id);
    await asUser(editor);
    await oauth("disconnect");
    expect(await worker("credential", next.id, "run-one", { ciphertext: "refreshed-credential-value" })).toBeNull();
    expect(await worker("finish", next.id, "run-one", { snapshot: snapshot("google_api") })).toBeNull();
    await asUser(owner);
    expect((await db.query("select snapshot->>'data_origin' as origin from public.discovery_reports")).rows).toEqual([{ origin: "manual_snapshot" }]);
    await expect(call("sync")).rejects.toMatchObject({ code: "22023" });
  });

  it("rechecks the original consenter even when a different current editor requests refresh", async () => {
    await connect(editor);
    await asUser(owner);
    const job = await call<{ id: string }>("sync");
    await db.exec("reset role");
    await db.query("delete from public.author_members where author_id=$1 and user_id=$2", [author, editor]);
    expect(await worker("claim", job.id)).toBeNull();
    await asUser(owner);
    expect((await db.query("select state from public.discovery_jobs where id=$1", [job.id])).rows).toEqual([{ state: "cancelled" }]);
  });

  it("cancels audit work after its requesting editor loses access and sanitizes provider errors", async () => {
    await asUser(editor);
    const saved = await page();
    const job = await call<{ id: string }>("audit", { pageId: saved.id });
    await worker("claim", job.id);
    await db.exec("reset role");
    await db.query("update public.author_members set role='viewer' where author_id=$1 and user_id=$2", [author, editor]);
    expect(await worker("finish", job.id, "run-one", { audit: { findings: [] } })).toBeNull();
    await asUser(owner);
    const next = await call<{ id: string }>("audit", { pageId: (await page()).id });
    await worker("fail", next.id, null, { code: "secret-provider-response" });
    await asUser(owner);
    expect((await db.query("select error from public.discovery_jobs where id=$1", [next.id])).rows).toEqual([{ error: "interrupted" }]);
  });

  it("invalidates an old property worker and rejects a mismatched report property", async () => {
    await connect();
    const job = await call<{ id: string }>("sync");
    await worker("claim", job.id);
    await expect(worker("finish", job.id, "run-one", { snapshot: { ...snapshot("google_api"), property: "https://other.example.com/" } })).rejects.toMatchObject({ code: "22023" });
    await asUser(editor);
    await oauth("select", { property: "sc-domain:author.example.com" });
    expect(await worker("finish", job.id, "run-one", { snapshot: snapshot("google_api") })).toBeNull();
  });

  it("bounds reports and prevents page-specific search jobs from bypassing refresh limits", async () => {
    await connect();
    const saved = await page();
    await expect(call("sync", { pageId: saved.id })).rejects.toMatchObject({ code: "22023" });
    const job = await call<{ id: string }>("sync");
    await worker("claim", job.id);
    await expect(worker("finish", job.id, "run-one", { snapshot: { ...snapshot("google_api"), rows: Array.from({ length: 10001 }, () => ({})) } })).rejects.toMatchObject({ code: "22023" });
    await expect(worker("finish", job.id, "run-one", { snapshot: { ...snapshot("google_api"), warning: "x".repeat(2200000) } })).rejects.toMatchObject({ code: "22023" });
    await asUser(owner);
    expect((await db.query("select id from public.discovery_reports")).rows).toEqual([]);
    expect((await db.query("select state from public.discovery_jobs")).rows).toEqual([{ state: "running" }]);
  });
});
