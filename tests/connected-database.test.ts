import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { author, evidence, initialApprovals, seedId } from "@/lib/data/seed";
import { createConnectedRepository } from "@/lib/db/connected-repository";

const db = new PGlite({ extensions: { vector } });
const bootstrapDb = new PGlite({ extensions: { vector } });
const owner = seedId(900), outsider = seedId(901), viewer = seedId(902), editor = seedId(903);
const realAgent = seedId(920), realFinding = seedId(921), realRecommendation = seedId(922);
const otherAuthor = seedId(930), otherApproval = seedId(931), manualApproval = seedId(940);
const publicEvidence = JSON.stringify([evidence[1]]);

async function migrate(database: PGlite) {
  await database.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  for (const name of ["202609170001_foundation", "202609170002_knowledge_vectors", "202609170003_connected_workspace"])
    await database.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
}
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function decide(id: string, action: string, version: number, draft: string | null = null) {
  return db.query<{ id: string; status: string; version: number; draft: string }>(
    "select * from public.decide_approval($1,$2,$3,$4,$5)", [author.id, id, action, version, draft],
  );
}
beforeAll(async () => {
  await migrate(db);
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.query("insert into auth.users(id) values ($1),($2),($3),($4)", [owner, outsider, viewer, editor]);
  await db.query("update public.authors set owner_user_id=$1 where id=$2", [owner, author.id]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'viewer'),($1,$3,'editor')", [author.id, viewer, editor]);
  await db.query("insert into public.agent_definitions(id,author_id,name,role,data_origin) values($1,$2,'The Raven','Connected review','manual')", [realAgent, author.id]);
  await db.query(`insert into public.agent_findings(id,author_id,agent_id,type,title,summary,confidence,evidence,source_ids,data_origin)
    values($1,$2,$3,'catalog','Catalog review','Review sourced catalog metadata',0.9,$4::jsonb,ARRAY[$5]::uuid[],'manual')`,
    [realFinding, author.id, realAgent, publicEvidence, evidence[1].source_id]);
  await db.query(`insert into public.agent_recommendations(id,author_id,agent_id,finding_id,title,description,reason,objective,confidence,effort,priority_score,evidence,source,data_origin)
    values($1,$2,$3,$4,'Confirm titles','Review the public catalog','Retain source accuracy','Verified catalog',0.9,'low',90,$5::jsonb,'Official website','manual')`,
    [realRecommendation, author.id, realAgent, realFinding, publicEvidence]);
  await db.query(`insert into public.approval_requests(id,author_id,type,title,description,draft,evidence,data_origin)
    values($1,$2,'metadata','Review metadata','Confirm public titles','Original review draft',$3::jsonb,'manual')`, [manualApproval, author.id, publicEvidence]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Second author','manual')", [otherAuthor, outsider]);
  await db.query(`insert into public.sources(id,author_id,name,source_type,retrieved_at,data_origin)
    values($1,$2,'Second source','website',now(),'public_verified')`, [seedId(932), otherAuthor]);
  const otherEvidence = JSON.stringify([{ ...evidence[1], source_id: seedId(932) }]);
  await db.query(`insert into public.approval_requests(id,author_id,type,title,description,draft,evidence,data_origin)
    values($1,$2,'metadata','Private review','Second author only','Private review draft',$3::jsonb,'manual')`, [otherApproval, otherAuthor, otherEvidence]);

  await migrate(bootstrapDb);
  await bootstrapDb.exec(readFileSync("supabase/bootstrap.sql", "utf8"));
  await bootstrapDb.exec(readFileSync("supabase/bootstrap.sql", "utf8"));
});
afterAll(async () => { await Promise.all([db.close(), bootstrapDb.close()]); });

describe("connected production bootstrap", () => {
  it("is idempotent, leaves ownership unassigned, and contains only catalog/manual snapshot records", async () => {
    expect((await bootstrapDb.query("select owner_user_id from public.authors")).rows).toEqual([{ owner_user_id: null }]);
    expect((await bootstrapDb.query<{ n: number }>("select count(*)::int n from public.books")).rows[0].n).toBe(8);
    expect((await bootstrapDb.query<{ n: number }>("select count(*)::int n from public.sources")).rows[0].n).toBe(4);
    expect((await bootstrapDb.query("select followers::int,posts::int,snapshot_at,is_live,data_origin from public.social_accounts")).rows).toEqual([
      { followers: 5447, posts: 880, snapshot_at: null, is_live: false, data_origin: "manual" },
    ]);
    for (const table of ["agent_definitions", "agent_findings", "agent_recommendations", "agent_runs", "approval_requests", "human_feedback", "tactic_memory", "approval_events"])
      expect((await bootstrapDb.query(`select id from public.${table}`)).rows, table).toEqual([]);
    expect((await bootstrapDb.query("select id from public.sources where data_origin='demo'")).rows).toEqual([]);
  });
  it("does not overwrite ownership when applied after setup", async () => {
    await bootstrapDb.query("insert into auth.users(id) values ($1)", [owner]);
    await bootstrapDb.query("update public.authors set owner_user_id=$1 where id=$2", [owner, author.id]);
    await bootstrapDb.exec(readFileSync("supabase/bootstrap.sql", "utf8"));
    expect((await bootstrapDb.query("select owner_user_id from public.authors")).rows).toEqual([{ owner_user_id: owner }]);
  });
});

describe("authenticated atomic workspace operations", () => {
  it("creates a member-supplied first review with attributed evidence and audit history", async () => {
    await asUser(editor);
    const created = await db.query<{ id: string; evidence: { source_id: string; metadata: { submitted_by: string }; excerpt_or_metric: string }[] }>(
      "select * from public.create_manual_review($1,$2,$3)", [author.id, "  Review autumn marketing  ", "  Review approved catalog images for an autumn campaign.  "],
    );
    expect(created.rows[0]).toMatchObject({ title: "Review autumn marketing", draft: "Review approved catalog images for an autumn campaign.", status: "pending", version: 0, type: "campaign", data_origin: "manual" });
    expect(created.rows[0].evidence[0].metadata.submitted_by).toBe(editor);
    expect(created.rows[0].evidence[0].excerpt_or_metric).toBe("Review approved catalog images for an autumn campaign.");
    const source = await db.query("select data_origin,source_type,metadata from public.sources where id=$1", [created.rows[0].evidence[0].source_id]);
    expect(source.rows[0]).toEqual({ data_origin: "manual", source_type: "human_feedback", metadata: { submitted_by: editor, purpose: "manual_business_review" } });
    expect((await db.query("select user_id,action from public.approval_events where approval_request_id=$1", [created.rows[0].id])).rows).toEqual([{ user_id: editor, action: "created" }]);
    const before = (await db.query<{ n: number }>("select count(*)::int n from public.sources")).rows[0].n;
    for (const [title, draft] of [["", "brief"], ["x".repeat(201), "brief"], ["Title", " "], ["Title", "x".repeat(10001)]])
      await expect(db.query("select * from public.create_manual_review($1,$2,$3)", [author.id, title, draft])).rejects.toThrow(/must contain/);
    expect((await db.query<{ n: number }>("select count(*)::int n from public.sources")).rows[0].n).toBe(before);
  });
  it("queues stored evidence exactly once when requests compete", async () => {
    await asUser(owner);
    const queued = await Promise.all([
      db.query<{ id: string; evidence: unknown; draft: string }>("select * from public.queue_recommendation($1,$2)", [author.id, realRecommendation]),
      db.query<{ id: string; evidence: unknown; draft: string }>("select * from public.queue_recommendation($1,$2)", [author.id, realRecommendation]),
    ]);
    expect(queued[0].rows[0].id).toBe(queued[1].rows[0].id);
    expect(queued[0].rows[0].evidence).toEqual([evidence[1]]);
    expect(queued[0].rows[0].draft).toContain("Cassandra reviews the sources");
    expect(queued[0].rows[0].draft).not.toContain("DEMO");
    expect((await db.query("select id from public.approval_requests where recommendation_id=$1", [realRecommendation])).rows).toHaveLength(1);
    expect((await db.query("select action,user_id from public.approval_events where approval_request_id=$1", [queued[0].rows[0].id])).rows).toEqual([{ action: "created", user_id: owner }]);
  });
  it("edits remain pending and stale competing decisions accept one version only", async () => {
    await asUser(owner);
    const edited = await decide(manualApproval, "edit", 0, "  Corrected review draft  ");
    expect(edited.rows[0]).toMatchObject({ status: "pending", version: 1, draft: "Corrected review draft" });
    const competing = await Promise.allSettled([decide(manualApproval, "approve", 1), decide(manualApproval, "reject", 1)]);
    expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = competing.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("request changed");
    const final = await db.query("select status,version from public.approval_requests where id=$1", [manualApproval]);
    expect(final.rows[0]).toEqual({ status: "approved", version: 2 });
    await expect(decide(manualApproval, "edit", 2, "Reopened")).rejects.toThrow(/immutable/);
    expect((await db.query("select action,previous_version,version,user_id from public.approval_events where approval_request_id=$1 order by version", [manualApproval])).rows).toEqual([
      { action: "edited", previous_version: 0, version: 1, user_id: owner },
      { action: "approved", previous_version: 1, version: 2, user_id: owner },
    ]);
  });
  it("another member reads saved decisions and records attributed lessons after a final decision", async () => {
    await asUser(editor);
    expect((await db.query("select status,version from public.approval_requests where id=$1", [manualApproval])).rows[0]).toEqual({ status: "approved", version: 2 });
    const feedback = await db.query("select * from public.teach_raven($1,$2,$3)", [author.id, manualApproval, "  Keep sourced wording.  "]);
    expect(feedback.rows[0]).toMatchObject({ user_id: editor, scope: "author_workspace", feedback: "Keep sourced wording.", data_origin: "manual" });
    await expect(db.query("select * from public.teach_raven($1,$2,$3)", [author.id, manualApproval, "   "])).rejects.toThrow(/Lesson/);
    await expect(db.query("insert into public.human_feedback(author_id,approval_request_id,user_id,feedback,scope) values($1,$2,$3,'Impersonated','author_workspace')", [author.id, manualApproval, owner])).rejects.toThrow(/row-level security/);
    expect((await db.query("update public.human_feedback set feedback='Changed' returning id")).rows).toEqual([]);
    expect((await db.query("delete from public.human_feedback returning id")).rows).toEqual([]);
  });
  it("records rejection without reopening and allows a lesson on the rejected request", async () => {
    await asUser(owner);
    const queued = await db.query<{ id: string }>("select * from public.queue_recommendation($1,$2)", [author.id, realRecommendation]);
    const id = queued.rows[0].id;
    expect((await decide(id, "reject", 0)).rows[0]).toMatchObject({ status: "rejected", version: 1 });
    await db.query("select * from public.teach_raven($1,$2,$3)", [author.id, id, "Do not use this direction."]);
    await expect(decide(id, "approve", 1)).rejects.toThrow(/immutable/);
    expect((await db.query("select status,version from public.queue_recommendation($1,$2)", [author.id, realRecommendation])).rows[0]).toEqual({ status: "rejected", version: 1 });
  });
  it("shares dismissals and restores a queued recommendation without losing its decision", async () => {
    await asUser(owner);
    await db.query("select public.dismiss_recommendation($1,$2)", [author.id, realRecommendation]);
    await asUser(editor);
    expect((await db.query("select status from public.agent_recommendations where id=$1", [realRecommendation])).rows[0]).toEqual({ status: "dismissed" });
    await db.query("select public.restore_recommendations($1)", [author.id]);
    expect((await db.query("select status from public.agent_recommendations where id=$1", [realRecommendation])).rows[0]).toEqual({ status: "queued" });
  });
  it("blocks viewers, outsiders, cross-author IDs, anonymous execution, and synthetic workspace actions", async () => {
    for (const user of [viewer, outsider]) {
      await asUser(user);
      for (const sql of [
        "select public.restore_recommendations($1)",
        "select public.create_manual_review($1,'Title','Brief')",
        "select public.queue_recommendation($1,$2)",
        "select public.dismiss_recommendation($1,$2)",
        "select public.teach_raven($1,$2,'lesson')",
        "select public.decide_approval($1,$2,'approve',0)",
      ]) await expect(db.query(sql, sql.includes("$2") ? [author.id, realRecommendation] : [author.id])).rejects.toThrow(/access denied/);
    }
    await asUser(owner);
    await expect(decide(otherApproval, "approve", 0)).rejects.toThrow(/not found/);
    await expect(decide(seedId(80), "approve", 0)).rejects.toThrow(/not found/);
    await expect(db.query("select public.queue_recommendation($1,$2)", [otherAuthor, realRecommendation])).rejects.toThrow(/access denied/);
    await db.exec("reset role; set role anon");
    await expect(db.query("select public.restore_recommendations($1)", [author.id])).rejects.toThrow(/permission denied/);
  });
  it("retains evidence validation and append-only audit privileges", async () => {
    await asUser(owner);
    await expect(db.query("update public.agent_recommendations set evidence=$1::jsonb where id=$2", [JSON.stringify([{ ...evidence[1], source_id: seedId(999) }]), realRecommendation])).rejects.toThrow(/source/);
    for (const sql of [
      "delete from public.approval_events",
      "update public.approval_events set action='approved'",
      `insert into public.approval_events(author_id,approval_request_id,user_id,action,version) values('${author.id}','${manualApproval}','${owner}','approved',99)`,
    ]) await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
    expect((await db.query("select relname from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r' and not relrowsecurity")).rows).toEqual([]);
  });
  it("prevents direct table writes from rewriting original provenance or approving an unseen edit", async () => {
    await asUser(editor);
    const created = await db.query<{ id: string; evidence: unknown }>("select * from public.create_manual_review($1,'Original title','Original source text')", [author.id]);
    const id = created.rows[0].id;
    for (const assignment of [
      "evidence=jsonb_set(evidence,'{0,excerpt_or_metric}','\"Rewritten source text\"')",
      `evidence=jsonb_set(evidence,'{0,metadata,submitted_by}','\"${owner}\"')`,
      "title='Rewritten title'", "description='Rewritten description'",
      "type='social'", "data_origin='public_verified'",
      `recommendation_id='${realRecommendation}'`,
    ]) await expect(db.query(`update public.approval_requests set ${assignment},version=version+1 where id=$1`, [id])).rejects.toThrow(/provenance.*immutable/);
    await expect(db.query("update public.approval_requests set draft='Unreviewed new draft',status='approved',version=version+1 where id=$1", [id])).rejects.toThrow(/remain pending/);
    expect((await db.query("select draft,evidence,status,version from public.approval_requests where id=$1", [id])).rows[0]).toEqual({
      draft: "Original source text", evidence: created.rows[0].evidence, status: "pending", version: 0,
    });
    expect((await db.query("select action,version from public.approval_events where approval_request_id=$1", [id])).rows).toEqual([{ action: "created", version: 0 }]);
    expect((await decide(id, "edit", 0, "An intentional revision")).rows[0]).toMatchObject({ status: "pending", version: 1 });
    expect((await decide(id, "approve", 1)).rows[0]).toMatchObject({ status: "approved", version: 2 });
  });
});

describe("session-bound repository mapping", () => {
  it("starts empty without synthetic defaults and scopes every select", async () => {
    const filters: unknown[][] = [];
    const client = {
      from(table: string) {
        const query = {
          select() { return query; },
          eq(key: string, value: string) { filters.push([table, key, value]); return query; },
          neq() { return query; }, order() { return query; }, limit() { return query; },
          then(resolve: (data: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    expect(await createConnectedRepository(client, author.id).loadWorkspace()).toEqual({
      version: 1, approvals: [], feedback: [], dismissed: [], recommendations: [], last_run_at: null,
    });
    for (const table of ["approval_requests", "human_feedback", "agent_recommendations", "agent_runs"])
      expect(filters).toContainEqual([table, "author_id", author.id]);
  });
  it("normalizes PostgREST dates and sends only validated RPC fields with the selected author", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const records: Record<string, unknown[]> = {
      approval_requests: [{ ...initialApprovals[1], data_origin: "manual", created_at: "2026-09-17T12:00:00+00:00", updated_at: "2026-09-17T13:00:00+00:00" }],
      human_feedback: [{ id: seedId(960), approval_request_id: initialApprovals[1].id, feedback: "Preserve this direction", user_id: owner, scope: "author_workspace", data_origin: "manual", created_at: "2026-09-17T13:00:00+00:00" }],
    };
    const client = {
      rpc(name: string, args: Record<string, unknown>) { calls.push([name, args]); return Promise.resolve({ data: null, error: null }); },
      from(table: string) {
        const query = {
          select() { return query; }, eq() { return query; }, neq() { return query; },
          order() { return query; }, limit() { return query; },
          then(resolve: (data: unknown) => unknown) { return Promise.resolve({ data: records[table] ?? [], error: null }).then(resolve); },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    const repository = createConnectedRepository(client, author.id);
    const state = await repository.createManualReview("  Review title  ", "  Business brief  ");
    expect(state.approvals[0].created_at).toBe("2026-09-17T12:00:00.000Z");
    expect(state.approvals[0].updated_at).toBe("2026-09-17T13:00:00.000Z");
    expect(state.feedback[0].created_at).toBe("2026-09-17T13:00:00.000Z");
    expect(calls[0]).toEqual(["create_manual_review", { p_author_id: author.id, p_title: "Review title", p_draft: "Business brief" }]);
    await repository.queueRecommendation(realRecommendation);
    expect(calls[1]).toEqual(["queue_recommendation", { p_author_id: author.id, p_recommendation_id: realRecommendation }]);
    await repository.decideApproval(manualApproval, { type: "edit", draft: " Revision " }, 2);
    expect(calls[2]).toEqual(["decide_approval", { p_author_id: author.id, p_approval_id: manualApproval, p_action: "edit", p_expected_version: 2, p_draft: "Revision" }]);
  });
});
