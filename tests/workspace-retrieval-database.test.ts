import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001", viewer = "10000000-0000-4000-8000-000000000002", outsider = "10000000-0000-4000-8000-000000000003";
const author = "20000000-0000-4000-8000-000000000001", otherAuthor = "20000000-0000-4000-8000-000000000002";
const result = { kind: "ideas", title: "A saved direction", summary: "Consider newsletter segmentation.", options: [{ title: "Ask readers", idea: "Review existing comments.", tradeoff: "A small sample.", first_step: "Check permissions.", verify: [] }], questions: [], context_used: [] };
async function asUser(user: string) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec("set role authenticated"); }
async function history(query = "", before: { created_at: string; id: string } | null = null, authorId = author, limit = 25, completed = false) {
  return (await db.query<{ id: string; created_at: string }>("select id,created_at::text from public.workspace_generation_history($1,$2,$3,$4,$5,$6)", [authorId, query, before?.created_at ?? null, before?.id ?? null, limit, completed])).rows;
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const name of ["202609170001_foundation", "20260918003251_workspace_generations", "202609260001_workspace_retrieval"]) await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  await db.query("insert into auth.users(id) values($1),($2),($3)", [owner, viewer, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other','manual')", [author, owner, otherAuthor, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'viewer')", [author, viewer]);
  await db.query(`insert into public.workspace_generations(id,author_id,created_by,job,prompt,status,result,created_at,completed_at)
    select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'brainstorm','Compare a business question number '||n,'complete',$3::jsonb,'2026-09-26 00:00:00.123456+00','2026-09-26 00:00:01+00' from generate_series(1,61) n`, [author, owner, JSON.stringify(result)]);
  await db.query("insert into public.workspace_generations(id,author_id,created_by,job,prompt) values('40000000-0000-4000-8000-000000000001',$1,$2,'learning','Unfinished question about newsletter')", [author, owner]);
  await asUser(owner);
});
afterAll(async () => db.close());
describe("Raven retrieval SQL", () => {
  it("walks more than 50 saved rows in stable timestamp/id order without duplicates", async () => {
    const found: string[] = []; let before = null;
    for (let i = 0; i < 4; i++) { const rows = await history("", before); found.push(...rows.map(row => row.id)); before = rows.at(-1) ?? null; if (!rows.length) break; }
    expect(found).toHaveLength(62); expect(new Set(found).size).toBe(62);
    expect(found.at(-1)).toBe("30000000-0000-4000-8000-000000000001");
  });
  it("searches question and answer strings, limits results and filters completed answers", async () => {
    expect(await history("segmentation", null, author, 6, true)).toHaveLength(6);
    expect(await history("permissions", null, author, 6, true)).toHaveLength(6);
    expect(await history("Unfinished", null, author, 6, false)).toHaveLength(1);
    expect(await history("Unfinished", null, author, 6, true)).toEqual([]);
    expect(await history("' OR true --", null, author, 6)).toEqual([]);
    await expect(history("x".repeat(201))).rejects.toMatchObject({ code: "22023" });
    await expect(history("", null, author, 52)).rejects.toMatchObject({ code: "22023" });
  });
  it("keeps invoker RLS for viewers, outsiders and anonymous callers", async () => {
    await asUser(viewer); expect(await history()).toHaveLength(25); expect(await history("", null, otherAuthor)).toEqual([]);
    await asUser(outsider); expect(await history()).toEqual([]);
    await db.exec("reset role; set role anon"); await expect(history()).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    const definition = await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc where proname='workspace_generation_history'");
    expect(definition.rows).toEqual([{ prosecdef: false }]);
  });
});
