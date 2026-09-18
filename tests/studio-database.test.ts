import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001", editor = "10000000-0000-4000-8000-000000000002", viewer = "10000000-0000-4000-8000-000000000003", outsider = "10000000-0000-4000-8000-000000000004";
const author = "20000000-0000-4000-8000-000000000001", otherAuthor = "20000000-0000-4000-8000-000000000002";
const prompt = "Help me compare a few business ideas for my published books.";
const recordingKey = "a".repeat(64); // Test-only capability; never used outside this temporary database.
const result = { kind: "ideas", title: "A small next step", summary: "Options to consider.", options: [{ title: "Ask readers", idea: "Review messages you already have.", tradeoff: "A small sample.", first_step: "Choose three approved comments.", verify: ["Check permission."] }], questions: [], context_used: ["my published books"] };
async function asUser(user: string) {
  await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec("set role authenticated");
}
async function begin(id: string = randomUUID(), authorId = author, question = prompt, key: string | null = recordingKey) {
  const response = await db.query<{ value: { created: boolean; generation: { id: string; status: string; created_by: string } } }>("select public.workspace_generation_begin($1,$2,'brainstorm',$3,$4) as value", [authorId, id, question, key]);
  return response.rows[0].value;
}
async function finish(id: string, status = "complete", output: unknown = result, authorId = author, key: string | null = recordingKey) {
  return db.query<{ value: { status: string; result: unknown; input_tokens: number; error_code: string | null } }>("select public.workspace_generation_finish($1,$2,$3,$4,$5,100,50,0.0002625,'gen_test',$6) as value", [authorId, id, status, output === null ? null : JSON.stringify(output), status === "failed" ? "timeout" : null, key]);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const name of ["202609170001_foundation", "20260918003251_workspace_generations", "20260918005218_studio_request_validation"]) await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  await db.query("insert into private.workspace_generation_config(singleton,recording_key_hash) values(true,encode(sha256(convert_to($1,'UTF8')),'hex'))", [recordingKey]);
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [owner, editor, viewer, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other','manual')", [author, owner, otherAuthor, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')", [author, editor, viewer]);
});
beforeEach(async () => { await db.exec("reset role; delete from public.workspace_generations"); await asUser(owner); });
afterAll(async () => { await db.close(); });

describe("persisted studio requests", () => {
  it("requires the server-only recording key even from authorized members and hides its hash", async () => {
    for (const key of [null, "", "b".repeat(64)]) await expect(begin(randomUUID(), author, prompt, key)).rejects.toThrow(/recording connection is not authorized/);
    const { generation } = await begin();
    for (const key of [null, "", "b".repeat(64)]) await expect(finish(generation.id, "complete", result, author, key)).rejects.toThrow(/recording connection is not authorized/);
    await expect(db.query("select * from private.workspace_generation_config")).rejects.toThrow(/permission denied/);
    await expect(db.query("update private.workspace_generation_config set recording_key_hash=repeat('a',64)")).rejects.toThrow(/permission denied/);
    const wrappers = await db.query<{ prosecdef: boolean }>("select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('workspace_generation_begin','workspace_generation_finish')");
    expect(wrappers.rows).toEqual([{ prosecdef: false }, { prosecdef: false }]);
  });
  it("creates one attributed pending request and reuses the exact ID without creating another", async () => {
    const initial = await begin();
    expect(initial).toMatchObject({ created: true, generation: { status: "pending", created_by: owner } });
    expect(await begin(initial.generation.id)).toMatchObject({ created: false, generation: initial.generation });
    await expect(begin(initial.generation.id, author, "A different business question for the same ID")).rejects.toThrow(/already been used/);
    await expect(begin()).rejects.toThrow(/still being considered/);
  });
  it("rejects null or invalid inputs even when the UUID already has a saved request", async () => {
    const initial = await begin();
    for (const [job, question] of [[null, prompt], ["brainstorm", null], [null, null], ["unknown", prompt], ["brainstorm", "  "]]) {
      await expect(db.query("select public.workspace_generation_begin($1,$2,$3,$4,$5)", [author, initial.generation.id, job, question, recordingKey])).rejects.toMatchObject({ code: "22023" });
    }
    await expect(db.query("select public.workspace_generation_begin($1,null,'brainstorm',$2,$3)", [author, prompt, recordingKey])).rejects.toMatchObject({ code: "22023" });
    expect(await begin(initial.generation.id)).toMatchObject({ created: false, generation: initial.generation });
    expect((await db.query("select count(*)::int as count from public.workspace_generations")).rows[0]).toEqual({ count: 1 });
  });
  it("blocks anonymous, viewer, and cross-author mutation while allowing members to read their own workspace", async () => {
    const { generation } = await begin();
    await asUser(viewer);
    expect((await db.query("select id from public.workspace_generations")).rows).toEqual([{ id: generation.id }]);
    await expect(begin()).rejects.toThrow(/owner or editor/);
    await expect(finish(generation.id)).rejects.toThrow(/owner or editor/);
    await asUser(outsider);
    expect((await db.query("select id from public.workspace_generations")).rows).toEqual([]);
    await expect(begin()).rejects.toThrow(/owner or editor/);
    await expect(finish(generation.id)).rejects.toThrow(/owner or editor/);
    await expect(begin(generation.id, otherAuthor)).rejects.toThrow(/already been used/);
    await db.exec("reset role; set role anon");
    await expect(begin()).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.workspace_generations")).rejects.toThrow(/permission denied/);
  });
  it("only lets the requesting writer finish once and prevents direct record forgery or deletion", async () => {
    const { generation } = await begin();
    await asUser(editor);
    await expect(finish(generation.id)).rejects.toThrow(/another member/);
    await asUser(owner);
    expect((await finish(generation.id)).rows[0].value).toMatchObject({ status: "complete", result, input_tokens: 100, error_code: null });
    expect((await finish(generation.id, "failed", null)).rows[0].value).toMatchObject({ status: "complete", result });
    await expect(db.query("update public.workspace_generations set prompt='Altered prompt'")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.workspace_generations")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.workspace_generations(id,author_id,created_by,job,prompt) values($1,$2,$3,'brainstorm',$4)", [randomUUID(), author, owner, prompt])).rejects.toThrow(/permission denied/);
  });
  it("rejects unstructured answers and fabricated source excerpts before marking a result complete", async () => {
    const { generation } = await begin();
    const nullFields = Object.keys(result).map((field) => ({ ...result, [field]: null }));
    for (const bad of [{}, ...nullFields, { ...result, context_used: [null] }, { ...result, questions: [null] }, { ...result, options: [{ ...result.options[0], verify: [null] }] }, { ...result, context_used: ["An invented quote"] }, { ...result, options: [] }, { ...result, unexpected: "hidden" }]) await expect(finish(generation.id, "complete", bad)).rejects.toThrow(/Invalid structured/);
    expect((await db.query("select status from public.workspace_generations")).rows).toEqual([{ status: "pending" }]);
  });
  it("counts failed attempts against the atomic per-workspace daily limit", async () => {
    for (let index = 0; index < 20; index++) { const { generation } = await begin(); await finish(generation.id, "failed", null); }
    await expect(begin()).rejects.toThrow(/daily question limit/);
    expect((await db.query("select count(*)::int as count from public.workspace_generations")).rows[0]).toEqual({ count: 20 });
  });
  it("closes abandoned requests without rerunning them before accepting a later request", async () => {
    const { generation } = await begin();
    await db.exec("reset role");
    await db.query("update public.workspace_generations set created_at=now()-interval '3 minutes' where id=$1", [generation.id]);
    await asUser(owner);
    const next = await begin();
    expect(next.created).toBe(true);
    expect((await db.query("select status,error_code from public.workspace_generations where id=$1", [generation.id])).rows[0]).toEqual({ status: "failed", error_code: "interrupted" });
    expect((await begin(generation.id)).created).toBe(false);
  });
});
