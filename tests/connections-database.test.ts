import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { normalizeConnectionUrl, type ConnectionPlatform } from "@/lib/connections/schema";

const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001", editor = "10000000-0000-4000-8000-000000000002", viewer = "10000000-0000-4000-8000-000000000003", outsider = "10000000-0000-4000-8000-000000000004";
const author = "20000000-0000-4000-8000-000000000001", otherAuthor = "20000000-0000-4000-8000-000000000002";
async function asUser(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function add(authorId = author, platform = "instagram", url = "https://www.instagram.com/author") {
  return db.query<{ id: string; created_by: string; data_origin: string }>("insert into public.workspace_links(author_id,platform,label,url) values($1,$2,'My profile',$3) returning id,created_by,data_origin", [authorId, platform, url]);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const name of ["202609170001_foundation", "20260918003255_workspace_links"])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [owner, editor, viewer, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other','manual')", [author, owner, otherAuthor, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')", [author, editor, viewer]);
});
afterAll(async () => { await db.close(); });

describe("private saved links", () => {
  it("attributes manual links to the authenticated editor and permits shared read", async () => {
    await asUser(editor);
    const row = (await add()).rows[0];
    expect(row).toMatchObject({ created_by: editor, data_origin: "manual" });
    await asUser(viewer);
    expect((await db.query("select id from public.workspace_links")).rows).toEqual([{ id: row.id }]);
    await expect(add(author, "instagram", "https://www.instagram.com/another")).rejects.toThrow(/row-level security/);
    expect((await db.query("delete from public.workspace_links returning id")).rows).toEqual([]);
    await expect(db.query("update public.workspace_links set label='Changed'")).rejects.toThrow(/permission denied/);
  });
  it("blocks cross-author writes, reads, and anonymous access", async () => {
    await asUser(outsider);
    expect((await db.query("select id from public.workspace_links")).rows).toEqual([]);
    await expect(add()).rejects.toThrow(/row-level security/);
    await asUser(editor);
    await expect(add(otherAuthor)).rejects.toThrow(/row-level security/);
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.workspace_links")).rejects.toThrow(/permission denied/);
  });
  it("rejects spoofed authorship, synthetic origin, arbitrary hosts, and duplicate links at the database boundary", async () => {
    await asUser(owner);
    await expect(db.query("insert into public.workspace_links(author_id,platform,label,url,created_by) values($1,'instagram','Spoof','https://www.instagram.com/spoof',$2)", [author, editor])).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.workspace_links(author_id,platform,label,url,data_origin) values($1,'instagram','Spoof','https://www.instagram.com/spoof','demo')", [author])).rejects.toThrow(/permission denied/);
    for (const url of ["https://evil.test/author", "javascript:alert(1)", "https://www.instagram.com.evil.test/author", "https://www.instagram.com/author?token=secret", "https://www.instagram.com/login"])
      await expect(add(author, "instagram", url)).rejects.toThrow(/check constraint/);
    await expect(add()).rejects.toThrow(/unique constraint/);
  });
  it("accepts canonical links for every supported platform, while removing a link never changes historical social snapshots", async () => {
    await asUser(owner);
    for (const [platform, url] of [
      ["facebook", "https://facebook.com/profile.php?id=123"], ["tiktok", "https://tiktok.com/@author"],
      ["pinterest", "https://pinterest.com/author"], ["youtube", "https://youtube.com/@author"],
      ["notebooklm", "https://notebooklm.google.com/notebook/abc-123"],
    ] as [ConnectionPlatform, string][]) await add(author, platform, normalizeConnectionUrl(platform, url));
    expect((await db.query("delete from public.workspace_links returning id")).rows).toHaveLength(6);
    expect((await db.query("select id from public.social_accounts")).rows).toEqual([]);
  });
});
