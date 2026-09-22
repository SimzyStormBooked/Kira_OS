import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { vector } });
const owner = randomUUID(), editor = randomUUID(), viewer = randomUUID(), outsider = randomUUID();
const author = randomUUID(), otherAuthor = randomUUID();
const recordingKey = "a".repeat(64); // Isolated test database capability, never production.
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Book = { id: string; author_id: string; title: string; updated_at: string; active_manuscript_id: string | null };
type Manuscript = { id: string; author_id: string; book_id: string; source_id: string; asset_id: string; storage_path: string; status: string; version: number; chunk_count: number; completed_chunks: number };
type Chunk = { id: string; chunk_index: number; section: string; reference_text: string; content_hash: string };
type Batch = { id: string; status: string; chunk_ids: string[]; created_by: string };
type Begun = { created: boolean; batch: Batch | null; chunks: Chunk[] };
const usage = { inputTokens: 400, outputTokens: 200, embeddingTokens: null, estimatedCostUsd: 0.00105, gatewayGenerationId: "generation_fixture", embeddingGenerationId: null, embedding_status: "unavailable" };

async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function scalar<T>(sql: string, params: unknown[] = []) {
  // PGlite returns custom composite OIDs as strings; JSON preserves the real row.
  return (await db.query<{ value: T }>(`select to_jsonb(value) as value from (${sql}) typed_result`, params)).rows[0].value;
}
async function book(title = "The Quiet Library", tenant: string = author) {
  return scalar<Book>("select public.library_save_book($1,null,$2,null,null,null,null,'{}') as value", [tenant, title]);
}
async function register(bookId: string, text: string = randomUUID(), id: string = randomUUID(), tenant: string = author, key: string | null = recordingKey) {
  return scalar<Manuscript>("select public.manuscript_register($1,$2,$3,'story.txt','text/plain',100,$4,$5) as value", [tenant, id, bookId, hash(text), key]);
}
function chunks(count = 1, prefix = "Rowan protects the found family.") {
  return Array.from({ length: count }, (_, index) => {
    const reference_text = `${prefix} Chapter ${index + 1} records this event.`;
    return { id: randomUUID(), chunk_index: index, section: `Chapter ${index + 1}`, reference_text, content_hash: hash(reference_text) };
  });
}
async function store(manuscript: Manuscript, value: Chunk[]) {
  return scalar<Manuscript>("select public.manuscript_store_chunks($1,$2,$3,$4) as value", [manuscript.author_id, manuscript.id, JSON.stringify(value), recordingKey]);
}
async function begin(manuscript: Manuscript, requestId: string = randomUUID(), retry = false, key: string | null = recordingKey) {
  return scalar<Begun>("select public.manuscript_begin_batch($1,$2,$3,$4,$5) as value", [manuscript.author_id, manuscript.id, requestId, retry, key]);
}
function result(chunk: Chunk, name = "Rowan") {
  const citations = [{ chunk_id: chunk.id, quote: chunk.reference_text.slice(0, 32) }];
  return {
    facts: [{ category: "theme", statement: "The passage describes found family.", kind: "supported", spoiler: false, citations }],
    characters: [{ name, aliases: [], role: "Protector", description: "A character named in the passage.", personality: "", relationships: "", arc: "", marketing_description: "", spoiler: false, citations }],
  };
}
async function finish(manuscript: Manuscript, batch: Batch, value: unknown, error: string | null = null, embeddings: unknown[] = [], stats: unknown = usage) {
  return scalar<{ batch: Batch; manuscript: Manuscript }>("select public.manuscript_finish_batch($1,$2,$3,$4,$5,$6,$7,$8) as value", [manuscript.author_id, manuscript.id, batch.id, value === null ? null : JSON.stringify(value), error, JSON.stringify(stats), JSON.stringify(embeddings), recordingKey]);
}
async function complete(manuscript: Manuscript, value: Chunk[] = chunks(), name = "Rowan") {
  await store(manuscript, value);
  let last: Awaited<ReturnType<typeof finish>> | undefined;
  for (let index = 0; index < value.length; index += 4) {
    const next = await begin(manuscript);
    last = await finish(manuscript, next.batch!, result(next.chunks[0], name));
  }
  return last!;
}
async function search(query = "family", tenant: string = author, bookId: string | null = null, embedding: string | null = null) {
  return db.query<{ book_id: string; manuscript_id: string; chunk_id: string; excerpt: string; score: number }>("select * from public.manuscript_search($1,$2,$3::extensions.vector,$4,8)", [tenant, query, embedding, bookId]);
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner_id text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
    create policy unrelated_permissive_storage_policy on storage.objects for all to authenticated,anon using(true) with check(true);`);
  for (const name of ["202609170001_foundation", "202609170002_knowledge_vectors", "20260918003251_workspace_generations", "202609190001_manuscript_intelligence", "202609200001_background_reading", "202609200003_character_organization", "202609210002_citation_whitespace"]) {
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  }
  await db.query("insert into private.workspace_generation_config(singleton,recording_key_hash) values(true,encode(sha256(convert_to($1,'UTF8')),'hex'))", [recordingKey]);
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [owner, editor, viewer, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other author','manual')", [author, owner, otherAuthor, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')", [author, editor, viewer]);
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.sources cascade; truncate storage.objects");
  await asUser(owner);
});
afterAll(async () => { await db.close(); });

describe("private versioned manuscript knowledge", () => {
  it("creates attributed book metadata, detects stale edits, and rejects foreign series or viewers", async () => {
    const created = await book();
    expect(created).toMatchObject({ author_id: author, title: "The Quiet Library", active_manuscript_id: null });
    const edited = await scalar<Book>("select public.library_save_book($1,$2,'A new title',null,'A real series',1,'Author description',$3,$4) as value", [author, created.id, JSON.stringify({ audiobook_available: true, narrator: "Verified narrator", runtime_minutes: 500 }), created.updated_at]);
    expect(edited.title).toBe("A new title");
    await expect(scalar("select public.library_save_book($1,$2,'Stale',null,null,null,null,'{}',$3) as value", [author, created.id, created.updated_at])).rejects.toMatchObject({ code: "40001" });
    await expect(scalar("select public.library_save_book($1,null,'Foreign series',$2,null,null,null,'{}') as value", [author, randomUUID()])).rejects.toMatchObject({ code: "P0002" });
    await expect(db.query("update public.books set title='Direct forged edit'")).rejects.toThrow(/permission denied/);
    await asUser(viewer); await expect(book()).rejects.toMatchObject({ code: "42501" });
  });

  it("registers idempotent private versions and requires role plus server capability", async () => {
    const target = await book();
    const first = await register(target.id, "first version");
    const duplicate = await register(target.id, "first version");
    expect(duplicate.id).toBe(first.id);
    const second = await register(target.id, "second version");
    expect(second.version).toBe(2);
    expect(first.storage_path).toBe(`${author}/${target.id}/${first.id}.txt`);
    expect((await db.query<{ n: number }>("select count(*)::int n from public.manuscripts")).rows[0].n).toBe(2);
    for (const key of [null, "", "b".repeat(64)]) await expect(register(target.id, randomUUID(), randomUUID(), author, key)).rejects.toMatchObject({ code: "42501" });
    for (const user of [viewer, outsider]) { await asUser(user); await expect(register(target.id)).rejects.toMatchObject({ code: "42501" }); }
    await asUser(owner); await expect(register(target.id, randomUUID(), first.id)).rejects.toMatchObject({ code: "40001" });
    const wrappers = await db.query<{ prosecdef: boolean }>("select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('library_save_book','manuscript_register','manuscript_store_chunks','manuscript_begin_batch','manuscript_finish_batch','manuscript_search')");
    expect(wrappers.rows).toHaveLength(6); expect(wrappers.rows.every(row => !row.prosecdef)).toBe(true);
  });

  it("keeps Storage private and restricts uploads to the registered uploader without overwrite", async () => {
    const target = await book(), m = await register(target.id);
    await expect(db.query("insert into storage.objects(bucket_id,name) values('kira-manuscripts','unregistered.txt')")).rejects.toMatchObject({ code: "42501" });
    await asUser(editor);
    await expect(db.query("insert into storage.objects(bucket_id,name) values('kira-manuscripts',$1)", [m.storage_path])).rejects.toMatchObject({ code: "42501" });
    await asUser(owner);
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values('kira-manuscripts',$1,$2)", [m.storage_path, owner]);
    expect((await db.query("update storage.objects set name='replaced.txt' returning id")).rows).toEqual([]);
    expect((await db.query("delete from storage.objects returning id")).rows).toEqual([]);
    await expect(db.query("insert into storage.objects(bucket_id,name) values('kira-manuscripts',$1) on conflict(bucket_id,name) do update set name=excluded.name", [m.storage_path])).rejects.toMatchObject({ code: "42501" });
    await asUser(viewer); expect((await db.query("select name from storage.objects")).rows).toEqual([{ name: m.storage_path }]);
    await asUser(outsider); expect((await db.query("select name from storage.objects")).rows).toEqual([]);
    await db.exec("reset role; set role anon"); expect((await db.query("select name from storage.objects")).rows).toEqual([]);
    await db.exec("reset role"); expect((await db.query("select public from storage.buckets where id='kira-manuscripts'")).rows).toEqual([{ public: false }]);
  });

  it("seals chunks and prevents direct tampering with manuscript sources, permission, or content", async () => {
    const m = await register((await book()).id), text = chunks(2);
    expect((await store(m, text)).status).toBe("queued");
    expect((await store(m, text)).chunk_count).toBe(2);
    await expect(store(m, chunks(2))).rejects.toMatchObject({ code: "40001" });
    await expect(db.query("update public.content_assets set rights_status='restricted' where id=$1", [m.asset_id])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("delete from public.knowledge_chunks where manuscript_id=$1", [m.id])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("insert into public.knowledge_chunks(author_id,source_id,asset_id,chunk_index,reference_text,content_hash,data_origin) values($1,$2,$3,99,'Forged passage',$4,'manual')", [author, m.source_id, m.asset_id, hash("Forged passage")])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("update public.manuscripts set status='ready' where id=$1", [m.id])).rejects.toThrow(/permission denied/);
    const other = await register(m.book_id), malformed = chunks(); malformed[0].content_hash = "0".repeat(64);
    await expect(store(other, malformed)).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select status from public.manuscripts where id=$1", [other.id])).rows).toEqual([{ status: "uploading" }]);
  });

  it("reserves batches once, limits input to four chunks, and requires explicit retry for a failed attempt", async () => {
    const m = await register((await book()).id); await store(m, chunks(5));
    const initial = await begin(m);
    expect(initial.created).toBe(true); expect(initial.chunks).toHaveLength(4);
    expect(initial.chunks.reduce((n, c) => n + c.reference_text.length, 0)).toBeLessThanOrEqual(16000);
    expect((await begin(m, initial.batch!.id)).created).toBe(false);
    expect((await begin(m)).created).toBe(false);
    await finish(m, initial.batch!, null, "timeout", [], { ...usage, embedding_status: "not_started" });
    await expect(begin(m)).rejects.toMatchObject({ code: "40001" });
    const retried = await begin(m, randomUUID(), true); expect(retried.chunks.map(c => c.id)).toEqual(initial.chunks.map(c => c.id));
    await asUser(editor); await expect(finish(m, retried.batch!, result(retried.chunks[0]))).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects invented or foreign citations and only activates a completely processed version", async () => {
    const target = await book(), m = await register(target.id); await store(m, chunks(5));
    const first = await begin(m), good = result(first.chunks[0]);
    for (const invalid of [
      { ...good, extra: "hidden reasoning" },
      { ...good, facts: [{ ...good.facts[0], citations: [{ chunk_id: first.chunks[0].id, quote: "Invented quotation" }] }] },
      { ...good, facts: [{ ...good.facts[0], citations: [{ chunk_id: randomUUID(), quote: first.chunks[0].reference_text }] }] },
      { ...good, characters: [{ ...good.characters[0], spoiler: null }] },
    ]) await expect(finish(m, first.batch!, invalid)).rejects.toMatchObject({ code: "22023" });
    const partial = await finish(m, first.batch!, good); expect(partial.manuscript.status).toBe("processing");
    expect(partial.manuscript.completed_chunks).toBe(4);
    expect((await search()).rows).toEqual([]);
    expect((await db.query<{ active_manuscript_id: string | null }>("select active_manuscript_id from public.books where id=$1", [target.id])).rows[0].active_manuscript_id).toBeNull();
    const second = await begin(m); expect(second.chunks).toHaveLength(1);
    const done = await finish(m, second.batch!, result(second.chunks[0], "  ROWAN  ")); expect(done.manuscript.status).toBe("ready");
    expect(done.manuscript.completed_chunks).toBe(5);
    const profile = await db.query<{ profile: { facts: unknown[] }; review_status: string }>("select profile,review_status from public.book_intelligence");
    expect(profile.rows[0].profile.facts).toHaveLength(2); expect(profile.rows[0].review_status).toBe("unreviewed");
    expect((await db.query("select id from public.characters")).rows).toHaveLength(1);
    expect((await db.query("select id from public.book_characters")).rows).toHaveLength(1);
    expect((await search()).rows).toHaveLength(5);
    expect((await finish(m, second.batch!, null, "timeout")).batch.status).toBe("complete");
  });

  it("preserves the last good version, stable same-book characters, and historical citations across revisions", async () => {
    const target = await book(), original = await register(target.id, "original");
    await complete(original);
    const originalCharacter = (await db.query<{ id: string }>("select id from public.characters")).rows[0].id;
    const revised = await register(target.id, "revised"), newer = chunks(1, "Rowan protects family in a revised passage.");
    await store(revised, newer);
    expect((await search()).rows[0].manuscript_id).toBe(original.id);
    const run = await begin(revised); await finish(revised, run.batch!, result(newer[0], "rowan"));
    expect((await search()).rows.map(row => row.manuscript_id)).toEqual([revised.id]);
    expect((await db.query("select id from public.characters")).rows).toEqual([{ id: originalCharacter }]);
    expect((await db.query("select id from public.book_intelligence")).rows).toHaveLength(2);
    expect((await db.query("select id from public.book_characters")).rows).toHaveLength(2);
    expect((await db.query("select id from public.knowledge_chunks where manuscript_id=$1", [original.id])).rows).toHaveLength(1);
    const differentBook = await register((await book("Other book")).id); await complete(differentBook);
    expect((await db.query("select id from public.characters")).rows).toHaveLength(2);
  });

  it("isolates manuscript, intelligence, and retrieval by author and rejects cross-tenant foreign keys", async () => {
    const m = await register((await book()).id); await complete(m);
    await asUser(viewer); expect((await search()).rows).toHaveLength(1); await expect(begin(m)).rejects.toMatchObject({ code: "42501" });
    await asUser(outsider);
    for (const table of ["manuscripts", "manuscript_batches", "book_intelligence", "book_characters", "knowledge_chunks"]) expect((await db.query(`select id from public.${table}`)).rows).toEqual([]);
    await expect(search()).rejects.toMatchObject({ code: "42501" });
    const own = await register((await book("Other tenant", otherAuthor)).id, "other", randomUUID(), otherAuthor);
    await complete(own);
    expect((await search("family", otherAuthor)).rows.map(row => row.manuscript_id)).toEqual([own.id]);
    await db.exec("reset role");
    await expect(db.query("update public.books set active_manuscript_id=$1 where id=$2", [m.id, own.book_id])).rejects.toMatchObject({ code: "23503" });
    await db.exec("set role anon"); await expect(search()).rejects.toThrow(/permission denied/);
  });

  it("stores validated embeddings and falls back to full-text when embedding is unavailable", async () => {
    const m = await register((await book()).id), text = chunks(); await store(m, text); const run = await begin(m);
    const embedding = Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0);
    await expect(finish(m, run.batch!, result(text[0]), null, [{ chunk_id: randomUUID(), embedding, model: "openai/text-embedding-3-small" }], { ...usage, embeddingTokens: 20, embedding_status: "complete" })).rejects.toMatchObject({ code: "22023" });
    await finish(m, run.batch!, result(text[0]), null, [{ chunk_id: text[0].id, embedding, model: "openai/text-embedding-3-small" }], { ...usage, embeddingTokens: 20, embedding_status: "complete" });
    expect((await search("unmatched keyword", author, null, JSON.stringify(embedding))).rows[0].chunk_id).toBe(text[0].id);
    expect((await search()).rows[0].chunk_id).toBe(text[0].id);
  });

  it("keeps timed-out requests terminal and requires explicit retry before reserving another call", async () => {
    const m = await register((await book()).id); await store(m, chunks()); const first = await begin(m);
    await db.exec("reset role"); await db.query("update public.manuscript_batches set created_at=now()-interval '3 minutes' where id=$1", [first.batch!.id]); await asUser(owner);
    await expect(begin(m)).rejects.toMatchObject({ code: "40001" });
    const next = await begin(m, randomUUID(), true); expect(next.created).toBe(true);
    expect((await finish(m, first.batch!, result(first.chunks[0]))).batch.status).toBe("failed");
    await finish(m, next.batch!, result(next.chunks[0]));
    expect((await db.query<{ status: string }>("select status from public.manuscripts where id=$1", [m.id])).rows[0].status).toBe("ready");
  });

  it("counts failed calls toward the shared daily budget before any further reservation", async () => {
    const m = await register((await book()).id), text = chunks(); await store(m, text);
    await db.exec("reset role");
    await db.query("insert into public.manuscript_batches(id,author_id,manuscript_id,created_by,chunk_ids,status,error_code,completed_at) select gen_random_uuid(),$1,$2,$3,array[$4::uuid],'failed','timeout',now() from generate_series(1,150)", [author, m.id, owner, text[0].id]);
    await asUser(owner);
    await expect(begin(m, randomUUID(), true)).rejects.toMatchObject({ code: "54000" });
    expect((await db.query<{ n: number }>("select count(*)::int n from public.manuscript_batches")).rows[0].n).toBe(150);
  });

  it("rechecks stored source permission before beginning and before persisting paid results", async () => {
    const m = await register((await book()).id), text = chunks(); await store(m, text);
    const setRights = async (value: string) => {
      await db.exec("reset role; begin");
      await db.query("select set_config('kira.manuscript_recording_key',$1,true)", [recordingKey]);
      await db.query("update public.content_assets set rights_status=$1 where id=$2", [value, m.asset_id]);
      await db.exec("commit"); await asUser(owner);
    };
    await setRights("restricted"); await expect(begin(m)).rejects.toMatchObject({ code: "42501" });
    await setRights("approved"); const run = await begin(m);
    await setRights("restricted"); await expect(finish(m, run.batch!, result(text[0]))).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select status from public.manuscript_batches")).rows).toEqual([{ status: "pending" }]);
    await setRights("approved"); await finish(m, run.batch!, result(text[0]));
    expect((await search()).rows).toHaveLength(1);
    await setRights("restricted"); expect((await search()).rows).toEqual([]);
  });

  it("can resume a failed upload without resetting failed processing or permitting oversized chunks", async () => {
    const target = await book(), m = await register(target.id, "retry-file");
    const failed = await scalar<Manuscript>("select public.manuscript_fail_upload($1,$2,'storage_error',$3) as value", [author, m.id, recordingKey]);
    expect(failed.status).toBe("failed");
    await asUser(editor); await expect(register(target.id, "retry-file")).rejects.toMatchObject({ code: "42501" });
    await asUser(owner);
    const resumed = await register(target.id, "retry-file"); expect(resumed.id).toBe(m.id); expect(resumed.status).toBe("uploading");
    const oversized = chunks(); oversized[0].reference_text = " ".repeat(4000) + "x"; oversized[0].content_hash = hash(oversized[0].reference_text);
    await expect(store(m, oversized)).rejects.toMatchObject({ code: "22023" });
    await expect(scalar("select public.manuscript_register($1,$2,$3,'too-large.txt','text/plain',4194305,$4,$5) as value", [author, randomUUID(), target.id, hash("too-large"), recordingKey])).rejects.toMatchObject({ code: "22023" });
    await store(m, chunks()); const run = await begin(m); await finish(m, run.batch!, null, "timeout", [], { ...usage, embedding_status: "not_started" });
    expect((await register(target.id, "retry-file")).status).toBe("failed");
  });

  it("never rolls an active book back when an older version finishes after a newer one", async () => {
    const target = await book(), older = await register(target.id, "older"), newer = await register(target.id, "newer");
    await complete(newer); await complete(older);
    expect((await search()).rows.map(row => row.manuscript_id)).toEqual([newer.id]);
    expect((await db.query<{ active_manuscript_id: string }>("select active_manuscript_id from public.books where id=$1", [target.id])).rows[0].active_manuscript_id).toBe(newer.id);
    expect((await db.query("select id from public.characters")).rows).toHaveLength(1);
  });
});

type Job = { id: string; state: string };
async function control(m: Manuscript, action = "start", retry = false) {
  return scalar<Job>("select public.manuscript_reading_control($1,$2,$3,$4,$5) as value", [m.author_id, m.id, action, retry, recordingKey]);
}
async function worker(job: Job, batch: string, action = "claim", payload: unknown = {}, run = "run_test", key = recordingKey) {
  await db.exec("reset role; set role anon");
  return scalar<{ state: string; created: boolean; chunks: Chunk[] }>("select public.manuscript_reading_worker($1,$2,$3,$4,$5,$6) as value", [job.id, run, action, batch, JSON.stringify(payload), key]);
}
describe("durable manuscript jobs", () => {
  it("binds one run, reserves disjoint groups with a cap of two, and finishes out of order", async () => {
    const m = await register((await book()).id); await store(m, chunks(9)); const j = await control(m);
    expect((await control(m)).id).toBe(j.id);
    const a = randomUUID(), b = randomUUID(), c = randomUUID();
    const first = await worker(j, a), second = await worker(j, b);
    expect(first.chunks).toHaveLength(4); expect(second.chunks).toHaveLength(4);
    expect(first.chunks.some(x => second.chunks.some(y => y.id === x.id))).toBe(false);
    expect((await worker(j, c)).created).toBe(false);
    expect((await worker(j, randomUUID(), "claim", {}, "another_run")).state).toBe("superseded");
    const finishPayload = (part: Chunk) => ({ result: result(part), usage, embeddings: [], errorCode: null });
    await worker(j, b, "finish", finishPayload(second.chunks[0]));
    const third = await worker(j, c); expect(third.chunks).toHaveLength(1);
    await worker(j, a, "finish", finishPayload(first.chunks[0]));
    expect((await worker(j, c, "finish", finishPayload(third.chunks[0]))).state).toBe("complete");
    expect((await worker(j, c, "finish", finishPayload(third.chunks[0]))).state).toBe("complete");
    await asUser(owner);
    expect((await scalar<Manuscript>("select m as value from public.manuscripts m where id=$1", [m.id])).completed_chunks).toBe(9);
  });
  it("requires the server capability and current editor permission even without a user session", async () => {
    const m = await register((await book()).id); await store(m, chunks(5)); const j = await control(m);
    await expect(worker(j, randomUUID(), "claim", {}, "run_test", "b".repeat(64))).rejects.toThrow();
    await asUser(outsider); expect((await db.query("select * from public.manuscript_reading_jobs")).rows).toHaveLength(0);
    await expect(control(m)).rejects.toThrow();
    await asUser(viewer); await expect(control(m)).rejects.toThrow();
    await asUser(editor); const m2 = await register((await book()).id); await store(m2, chunks()); const j2 = await control(m2);
    await db.exec("reset role"); await db.query("delete from public.author_members where user_id=$1", [editor]);
    expect((await worker(j2, randomUUID())).state).toBe("needs_attention");
    await db.exec("reset role"); await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor')", [author, editor]);
    expect((await worker(j, randomUUID())).created).toBe(true);
  });
  it("persists pause, permits the in-flight result, and resumes only remaining passages", async () => {
    const m = await register((await book()).id); await store(m, chunks(5)); const j = await control(m); const id = randomUUID();
    const claim = await worker(j, id); await asUser(owner); await control(m, "pause");
    expect((await worker(j, randomUUID())).state).toBe("paused");
    await worker(j, id, "finish", { result: result(claim.chunks[0]), usage, embeddings: [], errorCode: null });
    await asUser(owner); const resumed = await control(m); expect(resumed.id).not.toBe(j.id);
    expect((await worker(resumed, randomUUID())).chunks).toHaveLength(1);
  });
  it("does not resubmit an uncertain paid request and persists provider failures without retrying", async () => {
    const m = await register((await book()).id); await store(m, chunks(5)); const j = await control(m); const id = randomUUID();
    await worker(j, id); expect((await worker(j, id)).state).toBe("needs_attention");
    expect((await worker(j, randomUUID())).created).toBe(false);
    expect((await worker(j, id, "finish", { result: null, usage, embeddings: [], errorCode: "timeout" })).state).toBe("needs_attention");
    await asUser(owner); await expect(control(m)).rejects.toThrow();
    const retry = await control(m, "start", true); expect(retry.id).not.toBe(j.id);
    expect((await worker(retry, randomUUID())).chunks).toHaveLength(4);
  });
});

describe("citations that carry the source's own whitespace", () => {
  // A PDF page's line breaks and padding live inside the stored passage, so the verbatim
  // span of a quote the model kept within its 300-character content limit can be far
  // longer in raw characters. The SQL boundary must bound the content, not the padding.
  const padded = (words: number) => Array.from({ length: words }, (_, index) => `word${index}`).join("\n   ");
  const cite = (chunk: Chunk, quote: string) => ({
    facts: [{ category: "theme", statement: "The passage repeats a padded refrain.", kind: "supported", spoiler: false, citations: [{ chunk_id: chunk.id, quote }] }],
    characters: [],
  });
  async function batchOver(text: string) {
    const target = await book(`Padded book ${text.length}`);
    const manuscript = await register(target.id, `padded ${text.length}`);
    const value = [{ id: randomUUID(), chunk_index: 0, section: "Chapter 1", reference_text: text, content_hash: hash(text) }];
    await store(manuscript, value);
    const begun = await begin(manuscript);
    return { manuscript, batch: begun.batch!, chunk: begun.chunks[0] };
  }

  it("accepts a verbatim quote longer than 300 raw characters when its content fits", async () => {
    const text = padded(40);
    const normalized = text.replace(/\s+/g, " ").trim();
    expect(text.length).toBeGreaterThan(300);
    expect(normalized.length).toBeLessThanOrEqual(300);
    const { manuscript, batch, chunk } = await batchOver(text);
    const finished = await finish(manuscript, batch, cite(chunk, chunk.reference_text));
    expect(finished.batch.status).toBe("complete");
    expect(finished.manuscript.completed_chunks).toBe(1);
  });

  it("rejects a quote whose content exceeds the limit however it is spaced", async () => {
    const text = padded(60);
    expect(text.replace(/\s+/g, " ").trim().length).toBeGreaterThan(300);
    const { manuscript, batch, chunk } = await batchOver(text);
    await expect(finish(manuscript, batch, cite(chunk, chunk.reference_text))).rejects.toMatchObject({ code: "22023" });
  });

  it("counts the same characters as whitespace that the application does", async () => {
    // PostgreSQL's own \\s does not match these; JavaScript's does. If the two disagreed,
    // the app would accept a citation the database then rejected, failing the whole batch.
    for (const code of [0x00a0, 0x1680, 0x2007, 0x202f, 0xfeff]) {
      const space = String.fromCodePoint(code);
      const text = Array.from({ length: 40 }, (_, index) => `word${index}`).join(`${space}${space} `);
      expect(text.replace(/\s+/g, " ").trim().length).toBeLessThanOrEqual(300);
      expect(text.length).toBeGreaterThan(300);
      const { manuscript, batch, chunk } = await batchOver(text);
      const finished = await finish(manuscript, batch, cite(chunk, chunk.reference_text));
      expect(finished.batch.status, `U+${code.toString(16)} must be treated as whitespace`).toBe("complete");
    }
  });

  it("still requires the quote to appear literally in the passage", async () => {
    const text = padded(20);
    const { manuscript, batch, chunk } = await batchOver(text);
    // Same words, but spacing the source does not contain: the database stays exact.
    await expect(finish(manuscript, batch, cite(chunk, chunk.reference_text.replace(/\s+/g, " ")))).rejects.toMatchObject({ code: "22023" });
    await expect(finish(manuscript, batch, cite(chunk, "a refrain the page never carried"))).rejects.toMatchObject({ code: "22023" });
  });
});
