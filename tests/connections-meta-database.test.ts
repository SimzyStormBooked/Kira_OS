import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001", editor = "10000000-0000-4000-8000-000000000002", outsider = "10000000-0000-4000-8000-000000000003";
const author = "20000000-0000-4000-8000-000000000001", otherAuthor = "20000000-0000-4000-8000-000000000002";
const proof = "a".repeat(64), nonce = "b".repeat(64), nextNonce = "c".repeat(64), cipher = "v1." + "x".repeat(100);
const scopes = ["pages_show_list", "pages_read_engagement", "read_insights", "instagram_basic", "instagram_manage_insights"];
const accounts = JSON.stringify([{ page_id: "123", page_name: "Author page", instagram_id: "456", instagram_username: "author" }]);
async function asUser(user: string) {
  await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec("set role authenticated");
}
async function begin(hash = nonce) { return db.query("select public.begin_meta_authorization($1,$2,$3)", [author, proof, hash]); }
async function consume(hash = nonce) { return db.query("select public.consume_meta_authorization($1,$2,$3)", [author, proof, hash]); }
async function save(hash: string | null = nonce, expected: string | null = null, expiresAt = new Date(Date.now() + 3600000).toISOString()) {
  return db.query("select public.save_meta_authorization($1,$2,'987',$3,$4,$5::text[],$6::jsonb,$7,$8)", [author, proof, cipher, expiresAt, scopes, accounts, hash, expected]);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const name of ["202609170001_foundation", "20260918004008_meta_authorization"]) await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  await db.query("insert into auth.users(id) values($1),($2),($3)", [owner, editor, outsider]);
  await db.query("insert into public.authors(id,owner_user_id,name,data_origin) values($1,$2,'Author','manual'),($3,$4,'Other','manual')", [author, owner, otherAuthor, outsider]);
  await db.query("insert into public.author_members(author_id,user_id,role) values($1,$2,'editor')", [author, editor]);
  await db.query("insert into private.meta_connector_config(server_proof_hash) values(encode(sha256(convert_to($1,'UTF8')),'hex'))", [proof]);
});
afterAll(async () => { await db.close(); });
describe("Meta owner and server capability boundary", () => {
  it("requires server capability even for the owner, and owner identity even with the capability", async () => {
    await asUser(owner);
    expect((await db.query<{ ready: boolean }>("select public.meta_connector_ready($1,$2) ready", [author, proof])).rows[0].ready).toBe(true);
    for (const candidate of [null, "wrong", "f".repeat(64)]) await expect(db.query("select public.read_meta_credential($1,$2)", [author, candidate])).rejects.toThrow(/capability/);
    await expect(db.query("select * from private.meta_credentials")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from private.meta_connector_config")).rejects.toThrow(/permission denied/);
    for (const user of [editor, outsider]) {
      await asUser(user);
      expect((await db.query<{ ready: boolean }>("select public.meta_connector_ready($1,$2) ready", [author, proof])).rows[0].ready).toBe(false);
      await expect(begin()).rejects.toThrow(/owner required/);
      await expect(db.query("select public.read_meta_credential($1,$2)", [author, proof])).rejects.toThrow(/owner required/);
    }
  });
  it("binds attempts to tenant and owner, consumes them exactly once, and refuses an expired attempt", async () => {
    await asUser(owner); await begin();
    await asUser(outsider);
    await expect(db.query("select public.consume_meta_authorization($1,$2,$3)", [otherAuthor, proof, nonce])).rejects.toThrow(/expired or already used/);
    await asUser(owner);
    const race = await Promise.allSettled([consume(), consume()]);
    expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await save();
    await expect(save()).rejects.toThrow(/cancelled or expired/);
    await begin(nextNonce);
    await db.exec("reset role"); await db.query("update private.meta_oauth_states set expires_at=now()-interval '1 minute' where state_hash=$1", [nextNonce]);
    await asUser(owner); await expect(consume(nextNonce)).rejects.toThrow(/expired or already used/);
  });
  it("shares only nonsecret account metadata, rejects direct writes, and isolates another tenant", async () => {
    await asUser(editor);
    const row = (await db.query("select * from public.meta_authorizations")).rows[0];
    expect(row).toMatchObject({ author_id: author, status: "authorized", meta_user_id: "987" });
    expect(row).not.toHaveProperty("ciphertext"); expect(JSON.stringify(row)).not.toContain(cipher);
    await expect(db.query("update public.meta_authorizations set status='authorized'")).rejects.toThrow(/permission denied/);
    await asUser(outsider); expect((await db.query("select * from public.meta_authorizations")).rows).toEqual([]);
    await asUser(owner); await expect(db.query("select public.read_meta_credential($1,$2)", [otherAuthor, proof])).rejects.toThrow(/owner required/);
  });
  it("cannot complete a pending callback or refresh after the owner disconnects", async () => {
    await asUser(owner); await begin(); await consume();
    await db.query("select public.remove_meta_authorization($1,$2,true)", [author, proof]);
    await expect(save()).rejects.toThrow(/cancelled or expired/);
    await expect(save(null, cipher)).rejects.toThrow(/Authorization changed/);
    expect((await db.query("select * from public.meta_authorizations")).rows).toEqual([]);
  });
  it("expires credentials, marks reconnect required and never returns the expired ciphertext", async () => {
    await asUser(owner); await begin(); await consume(); await save();
    await db.exec("reset role"); await db.query("update public.meta_authorizations set expires_at=now()-interval '1 minute' where author_id=$1", [author]);
    await asUser(owner);
    expect((await db.query("select public.read_meta_credential($1,$2) credential", [author, proof])).rows).toEqual([{ credential: null }]);
    expect((await db.query("select status from public.meta_authorizations")).rows).toEqual([{ status: "needs_reconnect" }]);
  });
  it("processes capability-verified provider revocation/deletion without granting anonymous metadata or secret reads", async () => {
    await asUser(owner); await begin(); await consume(); await save();
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.meta_authorizations")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.revoke_meta_identity('wrong','987',false)")).rejects.toThrow(/capability/);
    await db.query("select public.revoke_meta_identity($1,'987',false)", [proof]);
    await asUser(owner);
    expect((await db.query("select status from public.meta_authorizations")).rows).toEqual([{ status: "needs_reconnect" }]);
    expect((await db.query("select public.read_meta_credential($1,$2) credential", [author, proof])).rows).toEqual([{ credential: null }]);
    await db.exec("reset role; set role anon"); await db.query("select public.revoke_meta_identity($1,'987',true)", [proof]);
    await asUser(owner); expect((await db.query("select * from public.meta_authorizations")).rows).toEqual([]);
  });
  it("blocks provider revocation races during a first OAuth exchange and a captured refresh", async () => {
    await asUser(owner); await begin(); await consume();
    // No authorization row exists yet; a hashed tombstone still invalidates this attempt.
    await db.query("select public.revoke_meta_identity($1,'987',false)", [proof]);
    await expect(save()).rejects.toThrow(/revoked during this attempt/);
    expect((await db.query("select * from public.meta_authorizations")).rows).toEqual([]);
    // An explicit fresh authorization after revocation is allowed.
    await begin(nextNonce); await consume(nextNonce); await save(nextNonce);
    const captured = (await db.query<{ credential: { ciphertext: string } }>("select public.read_meta_credential($1,$2) credential", [author, proof])).rows[0].credential.ciphertext;
    await db.query("select public.revoke_meta_identity($1,'987',false)", [proof]);
    await expect(save(null, captured)).rejects.toThrow(/Authorization changed/);
    expect((await db.query("select status from public.meta_authorizations")).rows).toEqual([{ status: "needs_reconnect" }]);
    expect((await db.query("select public.read_meta_credential($1,$2) credential", [author, proof])).rows).toEqual([{ credential: null }]);
  });
});
