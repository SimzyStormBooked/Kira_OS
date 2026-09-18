-- Read-only Meta authorization. Only public metadata is browser-readable.
-- Provision SHA-256(server capability) administratively; never store the key/proof here.
create table private.meta_connector_config (
  singleton boolean primary key default true check(singleton),
  server_proof_hash text not null check(server_proof_hash ~ '^[0-9a-f]{64}$')
);
create table public.meta_authorizations (
  author_id uuid primary key references public.authors(id) on delete cascade,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  meta_user_id text not null check(meta_user_id ~ '^[0-9]{1,30}$'),
  status text not null check(status in ('authorized','needs_reconnect')),
  scopes text[] not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  accounts jsonb not null check(jsonb_typeof(accounts)='array' and jsonb_array_length(accounts) between 1 and 25)
);
create index meta_authorizations_provider_user on public.meta_authorizations(meta_user_id);
create table private.meta_credentials (
  author_id uuid primary key references public.meta_authorizations(author_id) on delete cascade,
  ciphertext text not null check(length(ciphertext) between 50 and 50000 and ciphertext like 'v1.%')
);
create table private.meta_oauth_states (
  state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
  author_id uuid not null references public.authors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(author_id,user_id)
);
-- Short-lived, hashed replay guard also covers revocation during a first OAuth exchange.
create table private.meta_revocations (identity_hash text primary key, revoked_at timestamptz not null);
alter table private.meta_revocations enable row level security;
revoke all on private.meta_revocations from public,anon,authenticated;
alter table private.meta_connector_config enable row level security;
alter table private.meta_credentials enable row level security;
alter table private.meta_oauth_states enable row level security;
alter table public.meta_authorizations enable row level security;
revoke all on private.meta_connector_config, private.meta_credentials, private.meta_oauth_states from public, anon, authenticated;
revoke all on public.meta_authorizations from public, anon, authenticated;
grant select on public.meta_authorizations to authenticated;
create policy meta_authorization_read on public.meta_authorizations for select to authenticated using(private.can_read_author(author_id));

-- SECURITY DEFINER lives only in the unexposed private schema. Every credential
-- operation needs both a verified owner and a capability unavailable to browsers.
create function private.assert_meta_server(p_server_proof text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_server_proof is null or p_server_proof !~ '^[0-9a-f]{64}$' or not exists(
    select 1 from private.meta_connector_config
    where server_proof_hash=encode(sha256(convert_to(p_server_proof,'UTF8')),'hex')
  ) then raise exception 'Meta server capability required' using errcode='42501'; end if;
end; $$;
create function private.assert_meta_owner(p_author_id uuid,p_server_proof text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_meta_server(p_server_proof);
  if auth.uid() is null or not private.owns_author(p_author_id) then
    raise exception 'Workspace owner required' using errcode='42501';
  end if;
end; $$;
create function private.meta_connector_ready(p_author_id uuid,p_server_proof text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.owns_author(p_author_id) and exists(
    select 1 from private.meta_connector_config where server_proof_hash=encode(sha256(convert_to(p_server_proof,'UTF8')),'hex')
  );
$$;
create function private.begin_meta_authorization(p_author_id uuid,p_server_proof text,p_state_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_meta_owner(p_author_id,p_server_proof);
  delete from private.meta_revocations where revoked_at<now()-interval '1 day';
  delete from private.meta_oauth_states where expires_at<=now() or (author_id=p_author_id and user_id=auth.uid());
  insert into private.meta_oauth_states(state_hash,author_id,user_id,expires_at) values(p_state_hash,p_author_id,auth.uid(),now()+interval '10 minutes');
end; $$;
create function private.consume_meta_authorization(p_author_id uuid,p_server_proof text,p_state_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare consumed text;
begin
  perform private.assert_meta_owner(p_author_id,p_server_proof);
  update private.meta_oauth_states set consumed_at=now() where state_hash=p_state_hash and author_id=p_author_id and user_id=auth.uid() and expires_at>now() and consumed_at is null returning state_hash into consumed;
  if consumed is null then raise exception 'Authorization attempt expired or already used' using errcode='22023'; end if;
end; $$;
create function private.save_meta_authorization(p_author_id uuid,p_server_proof text,p_meta_user_id text,p_ciphertext text,p_expires_at timestamptz,p_scopes text[],p_accounts jsonb,p_state_hash text,p_expected_ciphertext text) returns void
language plpgsql security definer set search_path = '' as $$
declare attempt_started timestamptz;
begin
  perform private.assert_meta_owner(p_author_id,p_server_proof);
  -- Provider identity lock precedes author locks everywhere to avoid deadlocks.
  perform pg_advisory_xact_lock(hashtextextended(p_meta_user_id,7320));
  -- Serialize completion/check/disconnect for this author; a cancelled attempt cannot resurrect access.
  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text,7319));
  if p_state_hash is not null and p_expected_ciphertext is null then
    delete from private.meta_oauth_states where state_hash=p_state_hash and author_id=p_author_id and user_id=auth.uid() and consumed_at is not null and expires_at>now() returning created_at into attempt_started;
    if not found then raise exception 'Authorization attempt was cancelled or expired' using errcode='22023'; end if;
    if exists(select 1 from private.meta_revocations where identity_hash=encode(sha256(convert_to(p_meta_user_id,'UTF8')),'hex') and revoked_at>=attempt_started) then
      raise exception 'Authorization was revoked during this attempt' using errcode='22023';
    end if;
  elsif p_state_hash is null and p_expected_ciphertext is not null then
    if not exists(select 1 from private.meta_credentials where author_id=p_author_id and ciphertext=p_expected_ciphertext) then
      raise exception 'Authorization changed; retry' using errcode='40001';
    end if;
  else raise exception 'Authorization completion required' using errcode='22023'; end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '1 year' then
    raise exception 'Valid authorization expiry required' using errcode='22023';
  end if;
  if p_scopes is null or not(p_scopes @> array['pages_show_list','pages_read_engagement','read_insights','instagram_basic','instagram_manage_insights']::text[])
     or not(p_scopes <@ array['pages_show_list','pages_read_engagement','read_insights','instagram_basic','instagram_manage_insights','public_profile']::text[]) then
    raise exception 'Expected read permissions required' using errcode='22023';
  end if;
  insert into public.meta_authorizations(author_id,authorized_by,meta_user_id,status,scopes,expires_at,accounts)
    values(p_author_id,auth.uid(),p_meta_user_id,'authorized',p_scopes,p_expires_at,p_accounts)
    on conflict(author_id) do update set authorized_by=auth.uid(),meta_user_id=excluded.meta_user_id,
      status='authorized',scopes=excluded.scopes,expires_at=excluded.expires_at,accounts=excluded.accounts,last_checked_at=now();
  insert into private.meta_credentials(author_id,ciphertext) values(p_author_id,p_ciphertext)
    on conflict(author_id) do update set ciphertext=excluded.ciphertext;
end; $$;
create function private.read_meta_credential(p_author_id uuid,p_server_proof text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.assert_meta_owner(p_author_id,p_server_proof);
  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text,7319));
  if exists(select 1 from public.meta_authorizations where author_id=p_author_id and expires_at<=now()) then
    delete from private.meta_credentials where author_id=p_author_id;
    update public.meta_authorizations set status='needs_reconnect' where author_id=p_author_id;
    return null;
  end if;
  select jsonb_build_object('ciphertext',c.ciphertext,'meta_user_id',a.meta_user_id,'expires_at',a.expires_at)
    into result from private.meta_credentials c join public.meta_authorizations a using(author_id)
    where c.author_id=p_author_id and a.status='authorized';
  return result;
end; $$;
create function private.remove_meta_authorization(p_author_id uuid,p_server_proof text,p_remove_metadata boolean,p_expected_ciphertext text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_meta_owner(p_author_id,p_server_proof);
  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text,7319));
  if p_expected_ciphertext is not null and not exists(select 1 from private.meta_credentials where author_id=p_author_id and ciphertext=p_expected_ciphertext) then return; end if;
  delete from private.meta_credentials where author_id=p_author_id;
  delete from private.meta_oauth_states where author_id=p_author_id;
  if p_remove_metadata then delete from public.meta_authorizations where author_id=p_author_id;
  else update public.meta_authorizations set status='needs_reconnect' where author_id=p_author_id; end if;
end; $$;
create function private.revoke_meta_identity(p_server_proof text,p_meta_user_id text,p_delete_data boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare affected_author uuid;
begin
  -- The server validates the provider HMAC before this capability-gated call.
  perform private.assert_meta_server(p_server_proof);
  if p_meta_user_id is null or p_meta_user_id !~ '^[0-9]{1,30}$' then raise exception 'Provider identity required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_meta_user_id,7320));
  insert into private.meta_revocations(identity_hash,revoked_at) values(encode(sha256(convert_to(p_meta_user_id,'UTF8')),'hex'),clock_timestamp())
    on conflict(identity_hash) do update set revoked_at=excluded.revoked_at;
  for affected_author in select author_id from public.meta_authorizations where meta_user_id=p_meta_user_id order by author_id loop
    perform pg_advisory_xact_lock(hashtextextended(affected_author::text,7319));
  end loop;
  delete from private.meta_credentials where author_id in(select author_id from public.meta_authorizations where meta_user_id=p_meta_user_id);
  delete from private.meta_oauth_states where author_id in(select author_id from public.meta_authorizations where meta_user_id=p_meta_user_id);
  if p_delete_data then delete from public.meta_authorizations where meta_user_id=p_meta_user_id;
  else update public.meta_authorizations set status='needs_reconnect' where meta_user_id=p_meta_user_id; end if;
end; $$;

create function public.meta_connector_ready(p_author_id uuid,p_server_proof text) returns boolean language sql security invoker set search_path='' as $$ select private.meta_connector_ready(p_author_id,p_server_proof); $$;
create function public.begin_meta_authorization(p_author_id uuid,p_server_proof text,p_state_hash text) returns void language sql security invoker set search_path='' as $$ select private.begin_meta_authorization(p_author_id,p_server_proof,p_state_hash); $$;
create function public.consume_meta_authorization(p_author_id uuid,p_server_proof text,p_state_hash text) returns void language sql security invoker set search_path='' as $$ select private.consume_meta_authorization(p_author_id,p_server_proof,p_state_hash); $$;
create function public.save_meta_authorization(p_author_id uuid,p_server_proof text,p_meta_user_id text,p_ciphertext text,p_expires_at timestamptz,p_scopes text[],p_accounts jsonb,p_state_hash text,p_expected_ciphertext text) returns void language sql security invoker set search_path='' as $$ select private.save_meta_authorization(p_author_id,p_server_proof,p_meta_user_id,p_ciphertext,p_expires_at,p_scopes,p_accounts,p_state_hash,p_expected_ciphertext); $$;
create function public.read_meta_credential(p_author_id uuid,p_server_proof text) returns jsonb language sql security invoker set search_path='' as $$ select private.read_meta_credential(p_author_id,p_server_proof); $$;
create function public.remove_meta_authorization(p_author_id uuid,p_server_proof text,p_remove_metadata boolean,p_expected_ciphertext text default null) returns void language sql security invoker set search_path='' as $$ select private.remove_meta_authorization(p_author_id,p_server_proof,p_remove_metadata,p_expected_ciphertext); $$;
create function public.revoke_meta_identity(p_server_proof text,p_meta_user_id text,p_delete_data boolean) returns void language sql security invoker set search_path='' as $$ select private.revoke_meta_identity(p_server_proof,p_meta_user_id,p_delete_data); $$;

revoke all on function private.assert_meta_server(text),private.assert_meta_owner(uuid,text),
  private.meta_connector_ready(uuid,text),private.begin_meta_authorization(uuid,text,text),private.consume_meta_authorization(uuid,text,text),
  private.save_meta_authorization(uuid,text,text,text,timestamptz,text[],jsonb,text,text),private.read_meta_credential(uuid,text),private.remove_meta_authorization(uuid,text,boolean,text),private.revoke_meta_identity(text,text,boolean),
  public.meta_connector_ready(uuid,text),public.begin_meta_authorization(uuid,text,text),public.consume_meta_authorization(uuid,text,text),
  public.save_meta_authorization(uuid,text,text,text,timestamptz,text[],jsonb,text,text),public.read_meta_credential(uuid,text),public.remove_meta_authorization(uuid,text,boolean,text),public.revoke_meta_identity(text,text,boolean)
from public,anon,authenticated;
grant execute on function private.meta_connector_ready(uuid,text),private.begin_meta_authorization(uuid,text,text),private.consume_meta_authorization(uuid,text,text),
  private.save_meta_authorization(uuid,text,text,text,timestamptz,text[],jsonb,text,text),private.read_meta_credential(uuid,text),private.remove_meta_authorization(uuid,text,boolean,text),
  public.meta_connector_ready(uuid,text),public.begin_meta_authorization(uuid,text,text),public.consume_meta_authorization(uuid,text,text),
  public.save_meta_authorization(uuid,text,text,text,timestamptz,text[],jsonb,text,text),public.read_meta_credential(uuid,text),public.remove_meta_authorization(uuid,text,boolean,text) to authenticated;
-- Provider webhooks have no user session. Their server capability is checked after
-- Meta's app-secret signature verification; no credentials can be read this way.
grant usage on schema private to anon;
grant execute on function private.revoke_meta_identity(text,text,boolean),public.revoke_meta_identity(text,text,boolean) to anon,authenticated;
