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
type Book = { id: string; author_id: string; title: string; active_manuscript_id: string | null };
type Manuscript = { id: string; author_id: string; book_id: string; status: string };
type Chunk = { id: string; chunk_index: number; section: string; reference_text: string; content_hash: string };
type Batch = { id: string; status: string; chunk_ids: string[] };
type Profile = { id: string; author_id: string; display_name: string; normalized_name: string; version: number; updated_at: string; primary_portrait_id: string | null };
type Portrait = { id: string; author_id: string; profile_id: string; storage_path: string; status: string; location_metadata_removed: boolean; sanitized_at: string | null; error_code: string | null; usage_permission: string };
const usage = { inputTokens: 400, outputTokens: 200, embeddingTokens: null, estimatedCostUsd: 0.00105, gatewayGenerationId: "generation_fixture", embeddingGenerationId: null, embedding_status: "unavailable" };

async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function scalar<T>(sql: string, params: unknown[] = []) {
  return (await db.query<{ value: T }>(`select to_jsonb(value) as value from (${sql}) typed_result`, params)).rows[0].value;
}
// Writes cannot be wrapped in a subquery, so they return their own row as JSON.
async function written<T>(sql: string, params: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, params)).rows[0].value;
}
async function book(title = "The Quiet Library", tenant: string = author) {
  return scalar<Book>("select public.library_save_book($1,null,$2,null,null,null,null,'{}') as value", [tenant, title]);
}
async function profile(displayName = "Celine", tenant: string = author) {
  return written<Profile>("insert into public.character_profiles as p(author_id,display_name) values($1,$2) returning to_jsonb(p) as value", [tenant, displayName]);
}
async function portrait(target: Profile, text: string = randomUUID(), id: string = randomUUID(), credit: string | null = null, permission: string | null = null, key: string | null = recordingKey) {
  return scalar<Portrait>("select public.character_portrait_register($1,$2,$3,'image/png',20480,$4,'Reference board',$5,$6,$7) as value", [target.author_id, id, target.id, hash(text), credit, permission, key]);
}
async function finish(target: Portrait, removed = true, key: string | null = recordingKey) {
  return scalar<Portrait>("select public.character_portrait_finish($1,$2,$3,900,1200,$4) as value", [target.author_id, target.id, removed, key]);
}

// A completed manuscript reading, so Studio behaviour can be checked against real
// extraction-owned rows rather than hand-written character records.
async function readManuscript(target: Book, text: string = randomUUID(), name = "Celine") {
  const manuscript = await scalar<Manuscript>("select public.manuscript_register($1,$2,$3,'story.txt','text/plain',100,$4,$5) as value", [target.author_id, randomUUID(), target.id, hash(text), recordingKey]);
  const reference_text = `${name} guards the found family. Chapter 1 records this event.`;
  const chunks = [{ id: randomUUID(), chunk_index: 0, section: "Chapter 1", reference_text, content_hash: hash(reference_text) }] satisfies Chunk[];
  await scalar("select public.manuscript_store_chunks($1,$2,$3,$4) as value", [target.author_id, manuscript.id, JSON.stringify(chunks), recordingKey]);
  const begun = await scalar<{ batch: Batch; chunks: Chunk[] }>("select public.manuscript_begin_batch($1,$2,$3,false,$4) as value", [target.author_id, manuscript.id, randomUUID(), recordingKey]);
  const citations = [{ chunk_id: begun.chunks[0].id, quote: reference_text.slice(0, 32) }];
  const result = {
    facts: [{ category: "theme", statement: "The passage describes found family.", kind: "supported", spoiler: false, citations }],
    characters: [{ name, aliases: [], role: "Protector", description: "A character named in the passage.", personality: "", relationships: "", arc: "", marketing_description: "", spoiler: false, citations }],
  };
  await scalar("select public.manuscript_finish_batch($1,$2,$3,$4,null,$5,'[]',$6) as value", [target.author_id, manuscript.id, begun.batch.id, JSON.stringify(result), JSON.stringify(usage), recordingKey]);
  const character = (await db.query<{ id: string }>("select id from public.characters where author_id=$1 and book_id=$2 and name=$3", [target.author_id, target.id, name])).rows[0].id;
  return { manuscript, character };
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
  for (const name of ["202609170001_foundation", "202609170002_knowledge_vectors", "20260918003251_workspace_generations", "202609190001_manuscript_intelligence", "202609200001_background_reading", "202609200003_character_organization", "202609210001_character_studio"]) {
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  }
  await db.query("insert into private.workspace_generation_config(singleton,recording_key_hash) values(true,encode(sha256(convert_to($1,'UTF8')),'hex'))", [recordingKey]);
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [owner, editor, viewer, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other author','manual')", [author, owner, otherAuthor, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')", [author, editor, viewer]);
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.character_profiles cascade; truncate public.sources cascade; truncate storage.objects");
  await asUser(owner);
});
afterAll(async () => { await db.close(); });

describe("author-owned character identity", () => {
  it("keeps profiles workspace-scoped, searchable by alias, and closed to viewers and other workspaces", async () => {
    const celine = await profile("  Celine   Dubois ");
    expect(celine).toMatchObject({ author_id: author, normalized_name: "celine dubois", version: 1, primary_portrait_id: null });
    await db.query("insert into public.character_profile_aliases(author_id,profile_id,alias) values($1,$2,'The Lark')", [author, celine.id]);
    await expect(db.query("insert into public.character_profile_aliases(author_id,profile_id,alias) values($1,$2,'the  lark')", [author, celine.id])).rejects.toThrow(/duplicate key/);
    const found = await db.query<{ display_name: string }>("select p.display_name from public.character_profiles p join public.character_profile_aliases a on a.author_id=p.author_id and a.profile_id=p.id where a.normalized_alias='the lark'");
    expect(found.rows).toHaveLength(1);
    // The same name in another universe is a separate identity, not a conflict.
    const namesake = await profile("Celine Dubois");
    expect(namesake.id).not.toBe(celine.id);
    await asUser(viewer);
    expect((await db.query("select id from public.character_profiles")).rows).toHaveLength(2);
    await expect(profile("Forged")).rejects.toThrow(/violates row-level security/);
    expect((await db.query("delete from public.character_profiles")).affectedRows).toBe(0);
    await asUser(outsider);
    expect((await db.query("select id from public.character_profiles")).rows).toHaveLength(0);
    await asUser(editor);
    await expect(profile("Editor addition")).resolves.toMatchObject({ author_id: author });
    await expect(db.query("insert into public.character_profiles(author_id,display_name,created_by) values($1,'Forged author',$2)", [author, outsider])).rejects.toThrow(/permission denied|violates row-level security/);
  });

  it("advances version and timestamp on the server and rejects a stale edit", async () => {
    const celine = await profile();
    const updated = await written<Profile>("update public.character_profiles as p set display_name='Celine Dubois' where id=$1 and version=1 returning to_jsonb(p) as value", [celine.id]);
    expect(updated.version).toBe(2);
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(celine.updated_at).getTime());
    const stale = await db.query("update public.character_profiles set summary='Stale write' where id=$1 and version=1", [celine.id]);
    expect(stale.affectedRows).toBe(0);
    await expect(db.query("update public.character_profiles set version=99 where id=$1", [celine.id])).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.character_profiles set author_id=$1 where id=$2", [otherAuthor, celine.id])).rejects.toThrow(/permission denied/);
  });
});

describe("explicit, reversible book links", () => {
  it("links one confirmed character per book, refuses foreign or duplicate claims, and unlinks cleanly", async () => {
    const quiet = await book();
    const { character } = await readManuscript(quiet);
    const celine = await profile();
    await db.query("insert into public.character_profile_links(author_id,profile_id,book_id,character_id,note) values($1,$2,$3,$4,'Confirmed by the author.')", [author, celine.id, quiet.id, character]);
    const other = await profile("Someone else");
    await expect(db.query("insert into public.character_profile_links(author_id,profile_id,book_id,character_id) values($1,$2,$3,$4)", [author, other.id, quiet.id, character]))
      .rejects.toThrow(/duplicate key/);
    const second = await readManuscript(await book("A second book"), "second book", "Brick");
    await expect(db.query("insert into public.character_profile_links(author_id,profile_id,book_id,character_id) values($1,$2,$3,$4)", [author, celine.id, quiet.id, second.character]))
      .rejects.toThrow(/violates foreign key constraint/);
    await asUser(viewer);
    expect((await db.query("delete from public.character_profile_links")).affectedRows).toBe(0);
    await asUser(owner);
    expect((await db.query("delete from public.character_profile_links where profile_id=$1", [celine.id])).affectedRows).toBe(1);
    // Reversing a decision changes nothing the extraction owns.
    expect((await db.query("select id from public.characters where id=$1", [character])).rows).toHaveLength(1);
    expect((await db.query("select id from public.book_characters where character_id=$1", [character])).rows).toHaveLength(1);
  });

  it("preserves portraits, notes and links when the book is read again", async () => {
    const quiet = await book();
    const first = await readManuscript(quiet, "first version");
    const celine = await profile();
    const image = await finish(await portrait(celine));
    await db.query("insert into public.character_notes(author_id,profile_id,book_id,kind,body) values($1,$2,$3,'author_confirmed','She never lies about the harbour.')", [author, celine.id, quiet.id]);
    await db.query("insert into public.character_profile_links(author_id,profile_id,book_id,character_id) values($1,$2,$3,$4)", [author, celine.id, quiet.id, first.character]);
    const second = await readManuscript(quiet, "second version");
    expect(second.manuscript.id).not.toBe(first.manuscript.id);
    expect(second.character).toBe(first.character);
    expect((await db.query("select id from public.character_portraits where id=$1 and status='ready'", [image.id])).rows).toHaveLength(1);
    expect((await db.query("select id from public.character_notes where profile_id=$1", [celine.id])).rows).toHaveLength(1);
    expect((await db.query("select id from public.character_profile_links where profile_id=$1", [celine.id])).rows).toHaveLength(1);
  });
});

describe("author notes beside extraction-owned observations", () => {
  it("accepts confirmed detail and visual inspiration only, and never rewrites manuscript findings", async () => {
    const quiet = await book();
    const { character } = await readManuscript(quiet);
    const celine = await profile();
    const note = await written<{ id: string; version: number; kind: string }>("insert into public.character_notes as n(author_id,profile_id,kind,body) values($1,$2,'visual_inspiration','Sea-glass palette.') returning to_jsonb(n) as value", [author, celine.id]);
    expect(note).toMatchObject({ kind: "visual_inspiration", version: 1 });
    await expect(db.query("insert into public.character_notes(author_id,profile_id,kind,body) values($1,$2,'manuscript_derived','Claimed as book evidence.')", [author, celine.id]))
      .rejects.toThrow(/violates check constraint/);
    await expect(db.query("insert into public.character_notes(author_id,profile_id,kind,body) values($1,$2,'author_confirmed','   ')", [author, celine.id]))
      .rejects.toThrow(/violates check constraint/);
    const edited = await written<{ version: number }>("update public.character_notes as n set body='Sea-glass and lamplight.' where id=$1 returning to_jsonb(n) as value", [note.id]);
    expect(edited.version).toBe(2);
    await expect(db.query("update public.book_characters set details='{}'::jsonb where character_id=$1", [character])).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.book_characters(author_id,book_id,manuscript_id,intelligence_id,character_id,normalized_name,details) values($1,$2,$3,$4,$5,'celine','{}')", [author, quiet.id, randomUUID(), randomUUID(), character]))
      .rejects.toThrow(/permission denied/);
  });
});

describe("private portraits with retained permission", () => {
  it("requires the server capability and an editor, and refuses direct table writes", async () => {
    const celine = await profile();
    await expect(portrait(celine, "no key", randomUUID(), null, null, null)).rejects.toMatchObject({ code: "42501" });
    await expect(portrait(celine, "wrong key", randomUUID(), null, null, "b".repeat(64))).rejects.toMatchObject({ code: "42501" });
    await asUser(viewer);
    await expect(portrait(celine)).rejects.toMatchObject({ code: "42501" });
    await asUser(owner);
    await expect(db.query("insert into public.character_portraits(author_id,profile_id,storage_path,mime_type,size_bytes,content_hash) values($1,$2,'forged/path',$3,10,$4)", [author, celine.id, "image/png", hash("forged")]))
      .rejects.toThrow(/permission denied/);
    const stored = await finish(await portrait(celine));
    await expect(db.query("update public.character_portraits set status='ready' where id=$1", [stored.id])).rejects.toThrow(/permission denied/);
  });

  it("derives the stored path, stays idempotent, and records a rights decision", async () => {
    const celine = await profile();
    const id = randomUUID();
    const registered = await portrait(celine, "board", id);
    expect(registered).toMatchObject({ status: "uploading", storage_path: `${author}/${celine.id}/${id}`, location_metadata_removed: false, usage_permission: "private_reference_only" });
    expect(await portrait(celine, "board", id)).toMatchObject({ id, status: "uploading" });
    expect((await portrait(celine, "board")).id).toBe(id); // Same image, already registered.
    await expect(portrait(celine, "different image", id)).rejects.toMatchObject({ code: "40001" });
    // Private reference permission is not promotional permission.
    await expect(portrait(celine, "promo", randomUUID(), null, "promotional_approved")).rejects.toMatchObject({ code: "22023" });
    const promotional = await portrait(celine, "promo", randomUUID(), "Commissioned from a named illustrator", "promotional_approved");
    expect(promotional.usage_permission).toBe("promotional_approved");
  });

  it("marks an image stored only when its location metadata was removed", async () => {
    const celine = await profile();
    const registered = await portrait(celine);
    await expect(finish(registered, false)).rejects.toMatchObject({ code: "22023" });
    const ready = await finish(registered);
    expect(ready).toMatchObject({ status: "ready", location_metadata_removed: true });
    expect(ready.sanitized_at).not.toBeNull();
    expect(await finish(registered)).toMatchObject({ status: "ready" });
    const failed = await scalar<Portrait>("select public.character_portrait_fail($1,$2,'storage_error',$3) as value", [author, (await portrait(celine, "lost upload")).id, recordingKey]);
    expect(failed).toMatchObject({ status: "failed", error_code: "storage_error" });
    const retried = await portrait(celine, "lost upload", failed.id);
    expect(retried).toMatchObject({ status: "uploading", error_code: null });
  });

  it("keeps the bucket private, path-bound and free of overwrites", async () => {
    const celine = await profile();
    const registered = await portrait(celine);
    await db.exec("reset role"); // Supabase owns the bucket catalogue; members never read it.
    expect((await db.query<{ public: boolean }>("select public from storage.buckets where id='kira-character-portraits'")).rows[0]).toMatchObject({ public: false });
    await asUser(owner);
    await db.query("insert into storage.objects(bucket_id,name) values('kira-character-portraits',$1)", [registered.storage_path]);
    await expect(db.query("insert into storage.objects(bucket_id,name) values('kira-character-portraits',$1)", [`${author}/${celine.id}/${randomUUID()}`]))
      .rejects.toThrow(/violates row-level security/);
    await asUser(outsider);
    expect((await db.query("select name from storage.objects where bucket_id='kira-character-portraits'")).rows).toHaveLength(0);
    await expect(db.query("delete from storage.objects where bucket_id='kira-character-portraits'")).resolves.toMatchObject({ affectedRows: 0 });
    await asUser(viewer);
    expect((await db.query("select name from storage.objects where bucket_id='kira-character-portraits'")).rows).toHaveLength(1);
    expect((await db.query("update storage.objects set name='replaced' where bucket_id='kira-character-portraits'")).affectedRows).toBe(0);
    await asUser(editor);
    expect((await db.query("delete from storage.objects where bucket_id='kira-character-portraits'")).affectedRows).toBe(1);
  });

  it("shows only a portrait of the same profile and releases it when the image is removed", async () => {
    const celine = await profile();
    const other = await profile("Brick");
    const image = await finish(await portrait(celine));
    const foreign = await finish(await portrait(other, "other board"));
    await db.query("update public.character_profiles set primary_portrait_id=$1 where id=$2", [image.id, celine.id]);
    await expect(db.query("update public.character_profiles set primary_portrait_id=$1 where id=$2", [foreign.id, celine.id]))
      .rejects.toThrow(/violates foreign key constraint/);
    await db.query("delete from public.character_portraits where id=$1", [image.id]);
    expect((await db.query<{ primary_portrait_id: string | null }>("select primary_portrait_id from public.character_profiles where id=$1", [celine.id])).rows[0].primary_portrait_id).toBeNull();
    // Removing the author's own identity record never reaches extraction-owned rows.
    const quiet = await book();
    const { character } = await readManuscript(quiet);
    await db.query("insert into public.character_profile_links(author_id,profile_id,book_id,character_id) values($1,$2,$3,$4)", [author, celine.id, quiet.id, character]);
    await db.query("delete from public.character_profiles where id=$1", [celine.id]);
    expect((await db.query("select id from public.characters where id=$1", [character])).rows).toHaveLength(1);
    expect((await db.query("select id from public.character_profile_links")).rows).toHaveLength(0);
  });
});
