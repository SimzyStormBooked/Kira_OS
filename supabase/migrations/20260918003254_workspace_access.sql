-- Owner-managed access for accounts that already exist and have confirmed email.
-- No auth users are created or changed, and no email is sent by these functions.
alter table public.author_members add column version integer not null default 0 check(version >= 0);

create table public.workspace_access_events (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  membership_id uuid not null,
  action text not null check(action in ('granted','role_changed','revoked')),
  previous_role text check(previous_role in ('editor','viewer')),
  role text check(role in ('editor','viewer')),
  created_at timestamptz not null default now()
);
alter table public.workspace_access_events enable row level security;
create policy access_events_owner_read on public.workspace_access_events for select to authenticated
  using(private.owns_author(author_id));
revoke all on public.workspace_access_events from public, anon, authenticated;
grant select on public.workspace_access_events to authenticated;
create index workspace_access_events_author_idx on public.workspace_access_events(author_id,created_at);

-- Membership writes go through the guarded functions, so table API calls cannot
-- bypass confirmation checks, version checks or the append-only event record.
revoke insert,update,delete on public.author_members from public,anon,authenticated;

create function private.workspace_access_list(p_author_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not private.owns_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'owner',jsonb_build_object('userId',a.owner_user_id,'email',u.email),
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'userId',m.user_id,'email',mu.email,'role',m.role,'version',m.version,
      'createdAt',m.created_at,'updatedAt',m.updated_at) order by m.created_at,m.id)
      from public.author_members m join auth.users mu on mu.id=m.user_id
      where m.author_id=p_author_id and m.user_id<>a.owner_user_id),'[]'::jsonb)
  ) into result from public.authors a join auth.users u on u.id=a.owner_user_id where a.id=p_author_id;
  return result;
end;
$$;

create function private.workspace_access_grant(p_author_id uuid,p_email text,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; target_id uuid; member public.author_members; normalized_email text;
begin
  -- Serialize management for this workspace and recheck ownership inside the RPC.
  select owner_user_id into owner_id from public.authors
    where id=p_author_id and owner_user_id=auth.uid() for update;
  if auth.uid() is null or not found then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_role is null or p_role not in ('editor','viewer') then raise exception 'Invalid access request' using errcode='22023'; end if;
  normalized_email:=lower(trim(p_email));
  if normalized_email is null or length(normalized_email) not between 3 and 254 then
    raise exception 'Invalid access request' using errcode='22023';
  end if;
  begin
    select id into strict target_id from auth.users
      where lower(email)=normalized_email and email_confirmed_at is not null
        and not coalesce(is_anonymous,false) and deleted_at is null
        and (banned_until is null or banned_until<=now());
  exception when no_data_found or too_many_rows then
    raise exception 'Existing confirmed account unavailable' using errcode='P0002';
  end;
  if target_id=owner_id then raise exception 'Owner access cannot be changed here' using errcode='22023'; end if;
  select * into member from public.author_members where author_id=p_author_id and user_id=target_id;
  if found then
    if member.role=p_role then return; end if;
    raise exception 'Access changed; refresh before updating' using errcode='40001';
  end if;
  insert into public.author_members(author_id,user_id,role) values(p_author_id,target_id,p_role) returning * into member;
  insert into public.workspace_access_events(author_id,actor_user_id,target_user_id,membership_id,action,role)
    values(p_author_id,auth.uid(),target_id,member.id,'granted',p_role);
end;
$$;

create function private.workspace_access_change(p_author_id uuid,p_member_id uuid,p_role text,p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; member public.author_members;
begin
  select owner_user_id into owner_id from public.authors
    where id=p_author_id and owner_user_id=auth.uid() for update;
  if auth.uid() is null or not found then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_role is null or p_role not in ('editor','viewer') or p_expected_version is null or p_expected_version<0 then
    raise exception 'Invalid access request' using errcode='22023';
  end if;
  select * into member from public.author_members where author_id=p_author_id and id=p_member_id for update;
  if not found then raise exception 'Membership unavailable' using errcode='P0002'; end if;
  if member.user_id=owner_id then raise exception 'Owner access cannot be changed here' using errcode='22023'; end if;
  if member.version<>p_expected_version then raise exception 'Access changed; refresh before updating' using errcode='40001'; end if;
  perform 1 from auth.users where id=member.user_id and email_confirmed_at is not null
    and not coalesce(is_anonymous,false) and deleted_at is null
    and (banned_until is null or banned_until<=now());
  if not found then raise exception 'Existing confirmed account unavailable' using errcode='P0002'; end if;
  if member.role=p_role then return; end if;
  update public.author_members set role=p_role,version=version+1 where id=member.id and author_id=p_author_id;
  insert into public.workspace_access_events(author_id,actor_user_id,target_user_id,membership_id,action,previous_role,role)
    values(p_author_id,auth.uid(),member.user_id,member.id,'role_changed',member.role,p_role);
end;
$$;

create function private.workspace_access_revoke(p_author_id uuid,p_member_id uuid,p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; member public.author_members;
begin
  select owner_user_id into owner_id from public.authors
    where id=p_author_id and owner_user_id=auth.uid() for update;
  if auth.uid() is null or not found then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<0 then raise exception 'Invalid access request' using errcode='22023'; end if;
  select * into member from public.author_members where author_id=p_author_id and id=p_member_id for update;
  -- A repeated removal is harmless. A later grant has a new membership UUID.
  if not found then return; end if;
  if member.user_id=owner_id then raise exception 'Owner access cannot be changed here' using errcode='22023'; end if;
  if member.version<>p_expected_version then raise exception 'Access changed; refresh before updating' using errcode='40001'; end if;
  delete from public.author_members where id=member.id and author_id=p_author_id;
  insert into public.workspace_access_events(author_id,actor_user_id,target_user_id,membership_id,action,previous_role)
    values(p_author_id,auth.uid(),member.user_id,member.id,'revoked',member.role);
end;
$$;

-- Keep privileged Auth lookups outside the exposed schema. These public wrappers
-- run as the caller; the private implementation checks ownership on every call.
create function public.workspace_access_list(p_author_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.workspace_access_list(p_author_id);
$$;
create function public.workspace_access_grant(p_author_id uuid,p_email text,p_role text) returns void
language sql security invoker set search_path = '' as $$
  select private.workspace_access_grant(p_author_id,p_email,p_role);
$$;
create function public.workspace_access_change(p_author_id uuid,p_member_id uuid,p_role text,p_expected_version integer) returns void
language sql security invoker set search_path = '' as $$
  select private.workspace_access_change(p_author_id,p_member_id,p_role,p_expected_version);
$$;
create function public.workspace_access_revoke(p_author_id uuid,p_member_id uuid,p_expected_version integer) returns void
language sql security invoker set search_path = '' as $$
  select private.workspace_access_revoke(p_author_id,p_member_id,p_expected_version);
$$;

-- Supabase may grant default function privileges independently of PUBLIC.
revoke all on function public.workspace_access_list(uuid),public.workspace_access_grant(uuid,text,text),
  public.workspace_access_change(uuid,uuid,text,integer),public.workspace_access_revoke(uuid,uuid,integer),
  private.workspace_access_list(uuid),private.workspace_access_grant(uuid,text,text),
  private.workspace_access_change(uuid,uuid,text,integer),private.workspace_access_revoke(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.workspace_access_list(uuid),public.workspace_access_grant(uuid,text,text),
  public.workspace_access_change(uuid,uuid,text,integer),public.workspace_access_revoke(uuid,uuid,integer),
  private.workspace_access_list(uuid),private.workspace_access_grant(uuid,text,text),
  private.workspace_access_change(uuid,uuid,text,integer),private.workspace_access_revoke(uuid,uuid,integer)
  to authenticated;
