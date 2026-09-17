import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync } from "node:fs";
import { seedId, author, evidence } from "@/lib/data/seed";

const db = new PGlite({ extensions: { vector } });
const owner = seedId(900);
const outsider = seedId(901);
const viewer = seedId(902);
const editor = seedId(903);
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  // Supabase-provided auth primitives are represented locally; the application SQL is unmodified.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  await db.exec(
    readFileSync("supabase/migrations/202609170001_foundation.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202609170002_knowledge_vectors.sql",
      "utf8",
    ),
  );
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.query("insert into auth.users(id) values ($1),($2),($3),($4)", [
    owner,
    outsider,
    viewer,
    editor,
  ]);
  await db.query("update public.authors set owner_user_id=$1 where id=$2", [
    owner,
    author.id,
  ]);
  await db.query(
    "insert into public.author_members(author_id,user_id,role) values ($1,$2,'viewer'),($1,$3,'editor')",
    [author.id, viewer, editor],
  );
});
afterAll(async () => {
  await db.close();
});
describe("Postgres migrations, seed, constraints and RLS", () => {
  it("applies both migrations and seeds eight verified titles with pgvector available", async () => {
    await db.exec("reset role");
    const books = await db.query<{ count: number }>(
      "select count(*)::int from public.books",
    );
    expect(books.rows[0].count).toBe(8);
    const ext = await db.query(
      "select extname from pg_extension where extname='vector'",
    );
    expect(ext.rows).toHaveLength(1);
  });
  it("has RLS on every application table", async () => {
    const result = await db.query(
      "select relname from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r' and not relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
  it("allows an owner to read and an outsider to see nothing", async () => {
    await asUser(owner);
    expect((await db.query("select id from public.books")).rows).toHaveLength(
      8,
    );
    await asUser(outsider);
    expect((await db.query("select id from public.books")).rows).toHaveLength(
      0,
    );
    await expect(
      db.query(
        "insert into public.tropes(author_id,name,data_origin) values ($1,'unverified','manual')",
        [author.id],
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("allows viewers to read but prevents their writes", async () => {
    await asUser(viewer);
    expect((await db.query("select id from public.books")).rows).toHaveLength(
      8,
    );
    await expect(
      db.query(
        "insert into public.campaigns(author_id,name,objective,data_origin) values ($1,'test','test','demo')",
        [author.id],
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("allows an editor to work but not grant membership", async () => {
    await asUser(editor);
    await db.query(
      "insert into public.campaigns(author_id,name,objective,data_origin) values ($1,'test','test','demo')",
      [author.id],
    );
    await expect(
      db.query(
        "insert into public.author_members(author_id,user_id,role) values ($1,$2,'editor')",
        [author.id, outsider],
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("rejects cross-author foreign key relationships", async () => {
    await db.exec("reset role");
    await db.query(
      "insert into public.authors(id,name,data_origin) values ($1,'Other test tenant','demo')",
      [seedId(910)],
    );
    await expect(
      db.query(
        "insert into public.books(author_id,series_id,source_id,title,slug,data_origin) values($1,$2,$3,'Cross-tenant','cross-tenant','demo')",
        [seedId(910), seedId(50), seedId(12)],
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it("rejects fabricated source IDs and demo-label laundering", async () => {
    await asUser(owner);
    const bad = [{ ...evidence[0], source_id: seedId(999) }];
    await expect(
      db.query(
        "update public.agent_findings set evidence=$1::jsonb where id=$2",
        [JSON.stringify(bad), seedId(40)],
      ),
    ).rejects.toThrow(/source/);
    await expect(
      db.query(
        "update public.agent_findings set data_origin='public_verified' where id=$1",
        [seedId(40)],
      ),
    ).rejects.toThrow(/Demo/);
  });
  it("requires version increments and makes reviewed approvals immutable", async () => {
    await asUser(owner);
    await expect(
      db.query(
        "update public.approval_requests set status='approved' where id=$1",
        [seedId(80)],
      ),
    ).rejects.toThrow(/version/);
    await db.query(
      "update public.approval_requests set status='approved',version=1 where id=$1 and version=0",
      [seedId(80)],
    );
    await expect(
      db.query(
        "update public.approval_requests set status='pending',version=2 where id=$1",
        [seedId(80)],
      ),
    ).rejects.toThrow(/immutable/);
  });
  it("prevents deletion of approval history and sources", async () => {
    await asUser(owner);
    expect(
      (
        await db.query(
          "delete from public.approval_requests where id=$1 returning id",
          [seedId(80)],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from public.sources returning id")).rows,
    ).toHaveLength(0);
  });
  it("rejects null evidence values even when keys are present", async () => {
    await asUser(owner);
    await expect(
      db.query(
        "update public.agent_findings set evidence=$1::jsonb where id=$2",
        [JSON.stringify([{ ...evidence[0], retrieved_at: null }]), seedId(40)],
      ),
    ).rejects.toThrow(/nonempty provenance/);
  });
  it("attributes lessons to the writer and forbids impersonation", async () => {
    await asUser(editor);
    await expect(
      db.query(
        "insert into public.human_feedback(author_id,approval_request_id,user_id,feedback,scope) values($1,$2,$3,'lesson','demo_workspace')",
        [author.id, seedId(80), owner],
      ),
    ).rejects.toThrow(/row-level security/);
    await db.query(
      "insert into public.human_feedback(author_id,approval_request_id,feedback,scope) values($1,$2,'Actual editor guidance','demo_workspace')",
      [author.id, seedId(80)],
    );
    const result = await db.query<{ user_id: string }>(
      "select user_id from public.human_feedback",
    );
    expect(result.rows[0].user_id).toBe(editor);
  });
  it("retains manual snapshot provenance without inventing a capture date", async () => {
    await asUser(owner);
    const result = await db.query<{
      followers: number;
      snapshot_at: null;
      is_live: boolean;
      data_origin: string;
    }>(
      "select followers::int,snapshot_at,is_live,data_origin from public.social_accounts",
    );
    expect(result.rows[0]).toEqual({
      followers: 5447,
      snapshot_at: null,
      is_live: false,
      data_origin: "manual",
    });
  });
});
