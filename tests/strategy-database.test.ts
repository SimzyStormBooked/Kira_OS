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
  for (const name of ["202609170001_foundation", "202609170002_knowledge_vectors", "20260918003251_workspace_generations", "202609190001_manuscript_intelligence", "202609190002_strategy_plans", "202609190003_studio_book_context"]) {
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  }
  await db.query("insert into private.workspace_generation_config(singleton,recording_key_hash) values(true,encode(sha256(convert_to($1,'UTF8')),'hex'))", [recordingKey]);
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [owner, editor, viewer, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other author','manual')", [author, owner, otherAuthor, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')", [author, editor, viewer]);
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.workspace_generations; truncate public.strategy_plans cascade; truncate public.sources cascade; truncate storage.objects");
  await asUser(owner);
});
afterAll(async () => { await db.close(); });

const planInput = (bookIds: string[] = []) => ({ title: "Backlist discovery", intent: "Find new readers with a low-cost backlist campaign.", bookIds, seriesId: null, originApprovalId: null, mode: "before_release", anchorDate: "2026-12-20", budgetUsd: 0, weeklyHours: 2, segments: ["new_readers"], goals: [{ id: randomUUID(), label: "New subscribers", metric: "subscribers", unit: "count", target: 50, baseline: 2, dueDate: "2026-12-20" }] });
async function save(input = planInput(), id: string = randomUUID(), expected: number | null = null) { return scalar<{ id: string; version: number; status: string }>("select public.strategy_save_plan($1,$2,$3,$4) as value", [author,id,expected,JSON.stringify(input)]); }
async function reserve(p: { id: string; version: number }, id: string = randomUUID()) { return scalar<{ created: boolean; revision: { id: string; input_snapshot: { evidence: { id: string; text: string }[]; input: ReturnType<typeof planInput> } } }>("select public.strategy_begin_revision($1,$2,$3,$4,$5) as value", [author,p.id,id,p.version,recordingKey]); }
function output(s: Awaited<ReturnType<typeof reserve>>["revision"]["input_snapshot"]) { const citations = [{ evidence_id: "request", quote: s.evidence[0].text.slice(0,30) }]; return { title: "Reach new readers", summary: "A hypothesis to test, not measured performance.", positioning: "Start with a small test.", audiences: [{ segment: "new_readers", why: "Chosen by the author", citations }], recommendations: [{ title: "Test a hook", action: "Prepare a test", rationale: "Validate reader fit", channel: "Instagram", effort: "low", estimated_cost_usd: 0, goal_ids: [s.input.goals[0].id], citations }], phases: [30,60,90].map(window => ({ window,label: `${window} days`,focus: "Learn from manual results",tasks: [{title:"Check results",instructions:"Record actual subscribers",channel:"Newsletter",day_offset:-window,goal_ids:[s.input.goals[0].id],success_measure:"Compare to baseline",citations}]})), risks:[],questions:[] }; }
async function finishPlan(r: Awaited<ReturnType<typeof reserve>>, value: unknown = output(r.revision.input_snapshot)) { return scalar("select public.strategy_finish_revision($1,$2,$3,null,$4,$5) as value", [author,r.revision.id,JSON.stringify(value),JSON.stringify({inputTokens:10,outputTokens:10,estimatedCostUsd:null,gatewayGenerationId:null}),recordingKey]); }
describe("persistent strategies", () => {
 it("creates immutable evidence, owner-reviewed dated tasks and manual results without duplicates", async () => {
   const b = await book(), m = await register(b.id), cs = chunks(); await complete(m,cs);
   const p = await save(planInput([b.id])), r = await reserve(p);
   expect(r.revision.input_snapshot.evidence.some(e => e.id.startsWith("fact-"))).toBe(true);
   expect(r.revision.input_snapshot.evidence.find(e => e.id.startsWith("fact-"))?.text).not.toContain("Chapter");
   expect((await reserve(p,r.revision.id)).created).toBe(false);
   await expect(finishPlan(r,{...output(r.revision.input_snapshot),phases:[]})).rejects.toMatchObject({code:"22023"});
   await finishPlan(r);
   await asUser(editor);
   await expect(scalar("select public.strategy_review_plan($1,$2,1,'approved','') as value",[author,p.id])).rejects.toMatchObject({code:"42501"});
   await asUser(owner);
   await scalar("select public.strategy_review_plan($1,$2,1,'approved','Reviewed evidence') as value",[author,p.id]);
   const active = await scalar<{status:string;campaign_id:string}>("select public.strategy_activate_plan($1,$2,2) as value",[author,p.id]); expect(active.status).toBe("active");
   expect(await scalar("select public.strategy_activate_plan($1,$2,2) as value",[author,p.id])).toEqual(active);
   const tasks = (await db.query<{id:string;due_date:string}>("select id,due_date::text from public.strategy_tasks order by due_date")).rows;
   expect(tasks.map(t=>t.due_date)).toEqual(["2026-09-21","2026-10-21","2026-11-20"]);
   for (const task of tasks) await scalar("select public.strategy_set_task($1,$2,0,'done') as value",[author,task.id]);
   expect((await db.query<{status:string}>("select status from public.strategy_plans")).rows[0].status).toBe("completed");
   const measurement = {id:randomUUID(),goalId:r.revision.input_snapshot.input.goals[0].id,value:7,measuredAt:"2026-09-01",note:"Manual newsletter dashboard count"};
   await scalar("select public.strategy_record_result($1,$2,$3) as value",[author,p.id,JSON.stringify(measurement)]);
   await scalar("select public.strategy_record_result($1,$2,$3) as value",[author,p.id,JSON.stringify(measurement)]);
   expect((await db.query("select * from public.strategy_results")).rows).toHaveLength(1);
   await expect(db.query("update public.strategy_revisions set output='{}'" )).rejects.toThrow(/permission denied/);
   await asUser(outsider); expect((await db.query("select * from public.strategy_plans")).rows).toHaveLength(0); expect((await db.query("select * from public.strategy_tasks")).rows).toHaveLength(0);
   await asUser(owner); await db.exec("reset role"); await db.query("select set_config('kira.manuscript_recording_key',$1,false)",[recordingKey]); await db.query("update public.content_assets set rights_status='restricted' where id=$1",[m.asset_id]); await asUser(owner);
   expect((await db.query("select * from public.strategy_revisions")).rows).toHaveLength(0); expect((await db.query("select * from public.strategy_tasks")).rows).toHaveLength(0);
 });
 it("rejects null types, foreign books, viewer writes, stale edits, unsupported citations and unreviewed activation", async () => {
   await expect(save({...planInput(), mode: null} as unknown as ReturnType<typeof planInput>)).rejects.toThrow();
   await expect(save(planInput([randomUUID()]))).rejects.toMatchObject({code:"42501"});
   const p=await save(); await expect(save(planInput(),p.id,3)).rejects.toMatchObject({code:"40001"});
   await expect(scalar("select public.strategy_activate_plan($1,$2,0) as value",[author,p.id])).rejects.toMatchObject({code:"22023"});
   const r=await reserve(p),v=output(r.revision.input_snapshot);v.recommendations[0].citations[0].quote="This was invented";
   await expect(finishPlan(r,v)).rejects.toMatchObject({code:"22023"});
   await expect(scalar("select public.strategy_begin_revision($1,$2,$3,0,'bad') as value",[author,p.id,randomUUID()])).rejects.toMatchObject({code:"42501"});
   await asUser(viewer);await expect(save()).rejects.toMatchObject({code:"42501"});
 });
});
describe("selected book context and catalog isolation",()=>{
 it("uses only selected approved sources, keeps spoiler passages opt-in, and preserves the original question",async()=>{
   const b=await book(),m=await register(b.id),cs=chunks(1,"A coordinator keeps found family records. SECRET outcome.");await complete(m,cs);
   const question="What do we know about Rowan and this book?",id=randomUUID();
   const started=await scalar<{generation:{prompt:string;knowledge_context:{evidence:{text:string}[]}}}>("select public.workspace_generation_begin_context($1,$2,'brainstorm',$3,$4,$5,false) as value",[author,id,question,recordingKey,[b.id]]);
   expect(started.generation.prompt).toBe(question);expect(started.generation.knowledge_context.evidence.length).toBeGreaterThan(1);expect(JSON.stringify(started.generation.knowledge_context)).not.toContain("SECRET");
   const quote=started.generation.knowledge_context.evidence[1].text.slice(0,60);
   const answer={kind:"ideas",title:"What the source supports",summary:"Supported observation; reader fit is still an inference.",options:[{title:"Check the source",idea:"Read the saved observation",tradeoff:"Bounded retrieval is not exhaustive",first_step:"Review the excerpt",verify:[]}],questions:[],context_used:[quote]};
   await scalar("select public.workspace_generation_finish($1,$2,'complete',$3,null,10,10,null,null,$4) as value",[author,id,JSON.stringify(answer),recordingKey]);
   await expect(scalar("select public.workspace_generation_begin_context($1,$2,'brainstorm',$3,$4,$5,true) as value",[author,id,question,recordingKey,[b.id]])).rejects.toMatchObject({code:"40001"});
   const withSpoilers=await scalar<{generation:{knowledge_context:{evidence:unknown[]}}}>("select public.workspace_generation_begin_context($1,$2,'brainstorm',$3,$4,$5,true) as value",[author,randomUUID(),question,recordingKey,[b.id]]);expect(JSON.stringify(withSpoilers)).toContain("SECRET");
   const catalog=await scalar<unknown[]>("select public.catalog_observations($1) as value",[author]);expect(catalog).toHaveLength(1);
   await asUser(outsider);expect((await db.query("select * from public.workspace_generations")).rows).toHaveLength(0);await expect(scalar("select public.catalog_observations($1) as value",[author])).rejects.toMatchObject({code:"42501"});
   await expect(scalar("select public.workspace_generation_begin_context($1,$2,'brainstorm',$3,$4,$5,false) as value",[otherAuthor,randomUUID(),question,recordingKey,[b.id]])).rejects.toMatchObject({code:"42501"});
   await asUser(owner);await db.exec("reset role");await db.query("select set_config('kira.manuscript_recording_key',$1,false)",[recordingKey]);await db.query("update public.content_assets set rights_status='restricted' where id=$1",[m.asset_id]);await asUser(owner);
   expect((await db.query("select * from public.workspace_generations")).rows).toHaveLength(0);expect(await scalar("select public.catalog_observations($1) as value",[author])).toEqual([]);
   await expect(scalar("select public.workspace_generation_begin_context($1,$2,'brainstorm',$3,$4,$5,false) as value",[author,id,question,recordingKey,[b.id]])).rejects.toMatchObject({code:"42501"});
 });
});
it("keeps changes-requested history and old evidence intact when a plan is revised",async()=>{
 const p=await save(),first=await reserve(p);await finishPlan(first);
 await scalar("select public.strategy_review_plan($1,$2,1,'changes_requested','Use a smaller newsletter test') as value",[author,p.id]);
 const edited=await save({...first.revision.input_snapshot.input,intent:"Test a smaller newsletter experiment with new readers."},p.id,2),second=await reserve(edited);expect(second.revision.input_snapshot.evidence.find(e=>e.id==="review-feedback")?.text).toContain("smaller newsletter");
 await finishPlan(second);await expect(scalar("select public.strategy_review_plan($1,$2,1,'approved','') as value",[author,p.id])).rejects.toMatchObject({code:"40001"});
 const original=await scalar<{input_snapshot:typeof first.revision.input_snapshot}>("select r as value from public.strategy_revisions r where id=$1",[first.revision.id]);expect(original.input_snapshot).toEqual(first.revision.input_snapshot);
 const history=(await db.query("select * from public.strategy_reviews where plan_id=$1",[p.id])).rows;expect(history).toHaveLength(1);
});
it("reserves quota atomically and rejects another request while a plan is pending",async()=>{
 const first=await save();await reserve(first);await expect(reserve(first)).rejects.toMatchObject({code:"55P03"});
 for(let i=1;i<20;i++)await reserve(await save());await expect(reserve(await save())).rejects.toMatchObject({code:"54000"});
});
