import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const author = id(1), otherAuthor = id(2), owner = id(10), otherOwner = id(11);
const viewer = id(12), editor = id(13), candidate = id(14), unconfirmed = id(15), banned = id(16), anonymous = id(17), deleted = id(18);
const viewerMembership = id(30), editorMembership = id(31), otherMembership = id(32);
async function asUser(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function grant(email: string, role = "viewer", workspace = author) {
  return db.query("select public.workspace_access_grant($1,$2,$3)", [workspace, email, role]);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(readFileSync("supabase/migrations/202609170001_foundation.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260918003254_workspace_access.sql", "utf8"));
  for (const [user, email] of [[owner,"owner@example.test"],[otherOwner,"other@example.test"],[viewer,"viewer@example.test"],[editor,"editor@example.test"],[candidate,"candidate@example.test"],[unconfirmed,"unconfirmed@example.test"],[banned,"banned@example.test"],[anonymous,"anonymous@example.test"],[deleted,"deleted@example.test"]]) {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [user,email]);
  }
  await db.query("update auth.users set email_confirmed_at=null where id=$1",[unconfirmed]);
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[banned]);
  await db.query("update auth.users set is_anonymous=true where id=$1",[anonymous]);
  await db.query("update auth.users set deleted_at=now() where id=$1",[deleted]);
  await db.query("insert into public.authors(id,owner_user_id,name) values($1,$2,'Workspace'),($3,$4,'Other workspace')",[author,owner,otherAuthor,otherOwner]);
});
beforeEach(async () => {
  await db.exec("reset role");
  await db.exec("delete from public.workspace_access_events; delete from public.author_members;");
  await db.query("insert into public.author_members(id,author_id,user_id,role) values($1,$2,$3,'viewer'),($4,$2,$5,'editor'),($6,$7,$8,'viewer')",[viewerMembership,author,viewer,editorMembership,editor,otherMembership,otherAuthor,candidate]);
  await asUser(owner);
});
afterAll(async () => { await db.close(); });

describe("Owner-only collaborator database boundary", () => {
  it("keeps privileged functions private, denies anonymous execution, and enables event RLS", async () => {
    await db.exec("reset role");
    expect((await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'workspace_access_%' and p.prosecdef")).rows).toEqual([]);
    expect((await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname='workspace_access_events'")).rows[0].relrowsecurity).toBe(true);
    await db.exec("set role anon");
    await expect(db.query("select public.workspace_access_list($1)",[author])).rejects.toMatchObject({ code: "42501" });
  });
  it.each([viewer,editor,candidate,otherOwner])("rejects all management and email listing from nonowner %s", async (user) => {
    await asUser(user);
    await expect(grant("candidate@example.test")).rejects.toMatchObject({ code:"42501" });
    await expect(db.query("select public.workspace_access_change($1,$2,'editor',0)",[author,viewerMembership])).rejects.toMatchObject({ code:"42501" });
    await expect(db.query("select public.workspace_access_revoke($1,$2,0)",[author,viewerMembership])).rejects.toMatchObject({ code:"42501" });
    await expect(db.query("select public.workspace_access_list($1)",[author])).rejects.toMatchObject({ code:"42501" });
  });
  it("adds only an existing confirmed account, normalizes email and repeats without duplicate membership or audit", async () => {
    await grant("  CANDIDATE@EXAMPLE.TEST  ");
    await grant("candidate@example.test");
    const { rows } = await db.query<{ data: { owner:{email:string};members:{userId:string;role:string;version:number}[] } }>("select public.workspace_access_list($1) as data",[author]);
    expect(rows[0].data.owner.email).toBe("owner@example.test");
    expect(rows[0].data.members.filter((member)=>member.userId===candidate)).toEqual([expect.objectContaining({role:"viewer",version:0})]);
    const events=await db.query("select actor_user_id,target_user_id,action,role from public.workspace_access_events");
    expect(events.rows).toEqual([{ actor_user_id:owner,target_user_id:candidate,action:"granted",role:"viewer" }]);
    await expect(grant("candidate@example.test","editor")).rejects.toMatchObject({code:"40001"});
  });
  it.each(["missing@example.test","unconfirmed@example.test","banned@example.test","anonymous@example.test","deleted@example.test"])("does not enroll unavailable account %s",async(email)=>{
    await expect(grant(email)).rejects.toMatchObject({code:"P0002",message:"Existing confirmed account unavailable"});
    expect((await db.query("select id from public.workspace_access_events")).rows).toHaveLength(0);
    await db.exec("reset role");
    expect((await db.query<{ count:number }>("select count(*)::integer as count from auth.users")).rows[0].count).toBe(9);
  });
  it("checks expected versions and audits role changes without mutating a stale record",async()=>{
    await db.query("select public.workspace_access_change($1,$2,'editor',0)",[author,viewerMembership]);
    await expect(db.query("select public.workspace_access_change($1,$2,'viewer',0)",[author,viewerMembership])).rejects.toMatchObject({code:"40001"});
    await expect(db.query("select public.workspace_access_revoke($1,$2,0)",[author,viewerMembership])).rejects.toMatchObject({code:"40001"});
    expect((await db.query("select role,version from public.author_members where id=$1",[viewerMembership])).rows).toEqual([{role:"editor",version:1}]);
    expect((await db.query("select action,previous_role,role from public.workspace_access_events")).rows).toEqual([{action:"role_changed",previous_role:"viewer",role:"editor"}]);
  });
  it("will not expand a legacy membership for an unconfirmed account, but still permits its removal",async()=>{
    await db.exec("reset role");
    await db.query("insert into public.author_members(id,author_id,user_id,role) values($1,$2,$3,'viewer')",[id(41),author,unconfirmed]);
    await asUser(owner);
    await expect(db.query("select public.workspace_access_change($1,$2,'editor',0)",[author,id(41)])).rejects.toMatchObject({code:"P0002"});
    await db.query("select public.workspace_access_revoke($1,$2,0)",[author,id(41)]);
    expect((await db.query("select id from public.author_members where id=$1",[id(41)])).rows).toEqual([]);
  });
  it("revokes immediately under the same JWT and a repeated old removal cannot remove later access",async()=>{
    await db.query("select public.workspace_access_revoke($1,$2,0)",[author,viewerMembership]);
    await db.query("select public.workspace_access_revoke($1,$2,0)",[author,viewerMembership]);
    await asUser(viewer);
    expect((await db.query("select id from public.authors where id=$1",[author])).rows).toEqual([]);
    await asUser(owner);
    await grant("viewer@example.test");
    await db.query("select public.workspace_access_revoke($1,$2,0)",[author,viewerMembership]);
    expect((await db.query("select id from public.author_members where user_id=$1 and author_id=$2",[viewer,author])).rows).toHaveLength(1);
    expect((await db.query("select action from public.workspace_access_events order by created_at")).rows).toEqual([{action:"revoked"},{action:"granted"}]);
  });
  it("protects the owner and cannot target a different workspace membership",async()=>{
    await expect(grant("owner@example.test")).rejects.toMatchObject({code:"22023"});
    await expect(grant("candidate@example.test","owner")).rejects.toMatchObject({code:"22023"});
    await expect(db.query("select public.workspace_access_change($1,$2,'editor',0)",[author,otherMembership])).rejects.toMatchObject({code:"P0002"});
    await db.query("select public.workspace_access_revoke($1,$2,0)",[author,otherMembership]);
    await db.exec("reset role");
    expect((await db.query("select role from public.author_members where id=$1",[otherMembership])).rows).toEqual([{role:"viewer"}]);
    await db.query("insert into public.author_members(id,author_id,user_id,role) values($1,$2,$3,'editor')",[id(40),author,owner]);
    await asUser(owner);
    await expect(db.query("select public.workspace_access_revoke($1,$2,0)",[author,id(40)])).rejects.toMatchObject({code:"22023"});
    await expect(db.query("select public.workspace_access_change($1,$2,'viewer',0)",[author,id(40)])).rejects.toMatchObject({code:"22023"});
  });
  it("prevents direct writes that bypass the guarded RPC and makes audit events immutable",async()=>{
    await expect(db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor')",[author,candidate])).rejects.toMatchObject({code:"42501"});
    await expect(db.query("update public.author_members set role='editor' where id=$1",[viewerMembership])).rejects.toMatchObject({code:"42501"});
    await expect(db.query("delete from public.author_members where id=$1",[viewerMembership])).rejects.toMatchObject({code:"42501"});
    await grant("candidate@example.test");
    await expect(db.query("delete from public.workspace_access_events")).rejects.toMatchObject({code:"42501"});
    await expect(db.query("update public.workspace_access_events set action='revoked'")).rejects.toMatchObject({code:"42501"});
    await asUser(viewer);
    expect((await db.query("select id from public.workspace_access_events")).rows).toEqual([]);
  });
});
