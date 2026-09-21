-- Character Studio foundation: author-owned character identity, private portraits,
-- and author-written notes.
--
-- Three existing constraints make this a new layer rather than an extension of
-- current tables. public.characters is book-scoped, so it cannot anchor an identity
-- that spans books or universes. public.content_assets is permanently read_only and
-- manuscript-owned, so portraits need their own table and bucket. public.book_characters
-- is extraction-owned and client-read-only, so author notes need an author-writable home.
-- Nothing here relaxes those rules: extraction output stays untouched and a portrait is
-- never evidence for a statement about a book.

-- Lets a profile link reference a character together with the book it belongs to.
alter table public.characters add constraint characters_author_book_id_key unique(author_id,book_id,id);

create table public.character_profiles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  universe_id uuid,
  display_name text not null check(length(trim(display_name)) between 1 and 120),
  normalized_name text not null generated always as (lower(regexp_replace(trim(display_name),'[[:space:]]+',' ','g'))) stored,
  summary text check(summary is null or length(summary)<=2000),
  primary_portrait_id uuid,
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  data_origin public.data_origin not null default 'manual' check(data_origin='manual'),
  unique(author_id,id),
  foreign key(author_id,universe_id) references public.universes(author_id,id)
);

create table public.character_portraits (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  profile_id uuid not null,
  storage_path text not null unique,
  status text not null default 'uploading' check(status in ('uploading','ready','failed')),
  mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 8388608),
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  width integer check(width between 1 and 20000), height integer check(height between 1 and 20000),
  caption text check(caption is null or length(caption)<=300),
  source_credit text check(source_credit is null or length(source_credit)<=300),
  -- Permission for private inspiration is not permission for public promotion.
  usage_permission text not null default 'private_reference_only' check(usage_permission in ('private_reference_only','promotional_approved')),
  permission_granted_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  location_metadata_removed boolean not null default false,
  sanitized_at timestamptz, error_code text check(error_code is null or error_code in ('storage_error','sanitize_error','unsupported_image')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  data_origin public.data_origin not null default 'manual' check(data_origin='manual'),
  unique(author_id,id), unique(author_id,profile_id,id), unique(author_id,profile_id,content_hash),
  -- A stored path is derived, never client-chosen, so Storage policies can trust it.
  check(storage_path=author_id::text||'/'||profile_id::text||'/'||id::text),
  check(status<>'ready' or (location_metadata_removed and sanitized_at is not null)),
  check(status<>'failed' or error_code is not null),
  check(usage_permission='private_reference_only' or source_credit is not null),
  foreign key(author_id,profile_id) references public.character_profiles(author_id,id) on delete cascade
);

alter table public.character_profiles add constraint character_profiles_primary_portrait_fkey
  foreign key(author_id,id,primary_portrait_id) references public.character_portraits(author_id,profile_id,id)
  on delete set null (primary_portrait_id);

create table public.character_profile_aliases (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  profile_id uuid not null,
  alias text not null check(length(trim(alias)) between 1 and 120),
  normalized_alias text not null generated always as (lower(regexp_replace(trim(alias),'[[:space:]]+',' ','g'))) stored,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(author_id,profile_id,normalized_alias),
  foreign key(author_id,profile_id) references public.character_profiles(author_id,id) on delete cascade
);

-- An identity link is an explicit author decision and stays reversible. A shared name
-- across books or universes is not evidence of the same character.
create table public.character_profile_links (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  profile_id uuid not null, book_id uuid not null, character_id uuid not null,
  note text check(note is null or length(note)<=600),
  confirmed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  unique(author_id,character_id),
  foreign key(author_id,profile_id) references public.character_profiles(author_id,id) on delete cascade,
  foreign key(author_id,book_id,character_id) references public.characters(author_id,book_id,id)
);

-- Author-written context. Manuscript-derived observations are deliberately not a kind
-- here; they remain in extraction-owned public.book_characters with their citations.
create table public.character_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  profile_id uuid not null, book_id uuid,
  kind text not null check(kind in ('author_confirmed','visual_inspiration')),
  body text not null check(length(trim(body)) between 1 and 4000),
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(author_id,profile_id) references public.character_profiles(author_id,id) on delete cascade,
  foreign key(author_id,book_id) references public.books(author_id,id)
);

-- Clients supply no timestamps or versions; every accepted update advances both.
create function private.character_studio_touch() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  new.updated_at:=now(); new.version:=old.version+1; return new;
end $$;
revoke all on function private.character_studio_touch() from public,anon,authenticated;
create trigger character_profiles_touch before update on public.character_profiles for each row execute function private.character_studio_touch();
create trigger character_notes_touch before update on public.character_notes for each row execute function private.character_studio_touch();

do $$ declare t text; begin
  foreach t in array array['character_profiles','character_portraits','character_profile_aliases','character_profile_links','character_notes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using(private.can_read_author(author_id))',t||'_read',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create index %I on public.%I(author_id)',t||'_author_idx',t);
  end loop;
end $$;
create index character_profiles_name_idx on public.character_profiles(author_id,normalized_name);
create index character_profile_aliases_name_idx on public.character_profile_aliases(author_id,normalized_alias);
create index character_portraits_profile_idx on public.character_portraits(author_id,profile_id);
create index character_profile_links_profile_idx on public.character_profile_links(author_id,profile_id);
create index character_notes_profile_idx on public.character_notes(author_id,profile_id);

create policy character_profiles_add on public.character_profiles for insert to authenticated
  with check(private.can_edit_author(author_id) and created_by=(select auth.uid()));
create policy character_profiles_edit on public.character_profiles for update to authenticated
  using(private.can_edit_author(author_id)) with check(private.can_edit_author(author_id));
create policy character_profiles_remove on public.character_profiles for delete to authenticated
  using(private.can_edit_author(author_id));
grant insert(id,author_id,universe_id,display_name,summary) on public.character_profiles to authenticated;
grant update(universe_id,display_name,summary,primary_portrait_id) on public.character_profiles to authenticated;
grant delete on public.character_profiles to authenticated;

create policy character_profile_aliases_add on public.character_profile_aliases for insert to authenticated
  with check(private.can_edit_author(author_id) and created_by=(select auth.uid()));
create policy character_profile_aliases_remove on public.character_profile_aliases for delete to authenticated
  using(private.can_edit_author(author_id));
grant insert(author_id,profile_id,alias) on public.character_profile_aliases to authenticated;
grant delete on public.character_profile_aliases to authenticated;

create policy character_profile_links_add on public.character_profile_links for insert to authenticated
  with check(private.can_edit_author(author_id) and confirmed_by=(select auth.uid()));
create policy character_profile_links_remove on public.character_profile_links for delete to authenticated
  using(private.can_edit_author(author_id));
grant insert(author_id,profile_id,book_id,character_id,note) on public.character_profile_links to authenticated;
grant delete on public.character_profile_links to authenticated;

create policy character_notes_add on public.character_notes for insert to authenticated
  with check(private.can_edit_author(author_id) and created_by=(select auth.uid()));
create policy character_notes_edit on public.character_notes for update to authenticated
  using(private.can_edit_author(author_id)) with check(private.can_edit_author(author_id));
create policy character_notes_remove on public.character_notes for delete to authenticated
  using(private.can_edit_author(author_id));
grant insert(author_id,profile_id,book_id,kind,body) on public.character_notes to authenticated;
grant update(kind,body) on public.character_notes to authenticated;
grant delete on public.character_notes to authenticated;

-- Portrait rows are never written directly: a stored path, a sanitization claim and a
-- rights record must come from the server, exactly as manuscript uploads do. Removing
-- an image stays an ordinary author action.
create policy character_portraits_remove on public.character_portraits for delete to authenticated
  using(private.can_edit_author(author_id));
grant delete on public.character_portraits to authenticated;

create function private.portrait_writer(p_author_id uuid,p_recording_key text) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform private.assert_studio_recording_key(p_recording_key);
  if auth.uid() is null or not private.can_edit_author(p_author_id) then raise exception 'Only an owner or editor can add character portraits.' using errcode='42501'; end if;
end $$;
revoke all on function private.portrait_writer(uuid,text) from public,anon,authenticated;

create function private.character_portrait_register(p_author_id uuid,p_id uuid,p_profile_id uuid,p_mime_type text,p_size_bytes integer,p_content_hash text,p_caption text,p_source_credit text,p_usage_permission text,p_recording_key text)
returns public.character_portraits language plpgsql security definer set search_path='' as $$
declare portrait public.character_portraits; begin
  perform private.portrait_writer(p_author_id,p_recording_key);
  if p_id is null or p_profile_id is null or p_size_bytes is null or p_size_bytes not between 1 and 8388608
    or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_mime_type is null or p_mime_type not in ('image/png','image/jpeg','image/webp')
    or (p_caption is not null and length(p_caption)>300) or (p_source_credit is not null and length(p_source_credit)>300)
    or coalesce(p_usage_permission,'private_reference_only') not in ('private_reference_only','promotional_approved')
    then raise exception 'Invalid portrait upload.' using errcode='22023'; end if;
  if coalesce(p_usage_permission,'private_reference_only')='promotional_approved' and nullif(trim(coalesce(p_source_credit,'')),'') is null then
    raise exception 'Promotional permission requires a recorded source and credit.' using errcode='22023'; end if;
  perform 1 from public.character_profiles where author_id=p_author_id and id=p_profile_id for update;
  if not found then raise exception 'Character profile unavailable.' using errcode='P0002'; end if;
  select * into portrait from public.character_portraits where id=p_id;
  if found then
    if portrait.author_id<>p_author_id or portrait.profile_id<>p_profile_id or portrait.content_hash<>p_content_hash or portrait.permission_granted_by<>auth.uid() then
      raise exception 'This portrait ID has already been used.' using errcode='40001'; end if;
    if portrait.status='failed' and portrait.error_code='storage_error' then
      update public.character_portraits set status='uploading',error_code=null,updated_at=now() where id=portrait.id returning * into portrait; end if;
    return portrait;
  end if;
  select * into portrait from public.character_portraits where author_id=p_author_id and profile_id=p_profile_id and content_hash=p_content_hash;
  if found then
    if portrait.status='failed' and portrait.error_code='storage_error' then
      if portrait.permission_granted_by<>auth.uid() then raise exception 'This portrait belongs to another member.' using errcode='42501'; end if;
      update public.character_portraits set status='uploading',error_code=null,updated_at=now() where id=portrait.id returning * into portrait; end if;
    return portrait;
  end if;
  insert into public.character_portraits(id,author_id,profile_id,storage_path,mime_type,size_bytes,content_hash,caption,source_credit,usage_permission,permission_granted_by)
    values(p_id,p_author_id,p_profile_id,p_author_id::text||'/'||p_profile_id::text||'/'||p_id::text,p_mime_type,p_size_bytes,p_content_hash,p_caption,p_source_credit,coalesce(p_usage_permission,'private_reference_only'),auth.uid())
    returning * into portrait;
  return portrait;
end $$;

-- Only the server can report that an image was stored and its location metadata removed.
create function private.character_portrait_finish(p_author_id uuid,p_id uuid,p_location_metadata_removed boolean,p_width integer,p_height integer,p_recording_key text)
returns public.character_portraits language plpgsql security definer set search_path='' as $$
declare portrait public.character_portraits; begin
  perform private.portrait_writer(p_author_id,p_recording_key);
  if p_location_metadata_removed is distinct from true then raise exception 'A portrait is stored only after its location metadata is removed.' using errcode='22023'; end if;
  if (p_width is not null and p_width not between 1 and 20000) or (p_height is not null and p_height not between 1 and 20000) then
    raise exception 'Invalid portrait dimensions.' using errcode='22023'; end if;
  select * into portrait from public.character_portraits where author_id=p_author_id and id=p_id for update;
  if not found then raise exception 'Portrait unavailable.' using errcode='P0002'; end if;
  if portrait.permission_granted_by<>auth.uid() then raise exception 'This portrait belongs to another member.' using errcode='42501'; end if;
  if portrait.status='ready' then return portrait; end if;
  if portrait.status<>'uploading' then raise exception 'This portrait upload has already failed.' using errcode='40001'; end if;
  update public.character_portraits set status='ready',location_metadata_removed=true,sanitized_at=now(),width=p_width,height=p_height,error_code=null,updated_at=now()
    where id=p_id returning * into portrait;
  return portrait;
end $$;

create function private.character_portrait_fail(p_author_id uuid,p_id uuid,p_error_code text,p_recording_key text)
returns public.character_portraits language plpgsql security definer set search_path='' as $$
declare portrait public.character_portraits; begin
  perform private.portrait_writer(p_author_id,p_recording_key);
  if p_error_code is null or p_error_code not in ('storage_error','sanitize_error','unsupported_image') then raise exception 'Invalid portrait failure.' using errcode='22023'; end if;
  select * into portrait from public.character_portraits where author_id=p_author_id and id=p_id for update;
  if not found then raise exception 'Portrait unavailable.' using errcode='P0002'; end if;
  if portrait.permission_granted_by<>auth.uid() then raise exception 'This portrait belongs to another member.' using errcode='42501'; end if;
  if portrait.status='uploading' then
    update public.character_portraits set status='failed',error_code=p_error_code,updated_at=now() where id=p_id returning * into portrait; end if;
  return portrait;
end $$;

create function public.character_portrait_register(p_author_id uuid,p_id uuid,p_profile_id uuid,p_mime_type text,p_size_bytes integer,p_content_hash text,p_caption text,p_source_credit text,p_usage_permission text,p_recording_key text)
returns public.character_portraits language sql security invoker set search_path='' as $$
  select private.character_portrait_register(p_author_id,p_id,p_profile_id,p_mime_type,p_size_bytes,p_content_hash,p_caption,p_source_credit,p_usage_permission,p_recording_key); $$;
create function public.character_portrait_finish(p_author_id uuid,p_id uuid,p_location_metadata_removed boolean,p_width integer,p_height integer,p_recording_key text)
returns public.character_portraits language sql security invoker set search_path='' as $$
  select private.character_portrait_finish(p_author_id,p_id,p_location_metadata_removed,p_width,p_height,p_recording_key); $$;
create function public.character_portrait_fail(p_author_id uuid,p_id uuid,p_error_code text,p_recording_key text)
returns public.character_portraits language sql security invoker set search_path='' as $$
  select private.character_portrait_fail(p_author_id,p_id,p_error_code,p_recording_key); $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in ('character_portrait_register','character_portrait_finish','character_portrait_fail') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;

-- Supabase manages Storage's schema. PGlite tests install a faithful RLS stub;
-- other SQL-only environments may omit Storage without preventing schema tests.
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    execute $policy$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('kira-character-portraits','kira-character-portraits',false,8388608,array['image/png','image/jpeg','image/webp'])
      on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$policy$;
    execute $policy$create policy kira_portrait_read on storage.objects for select to authenticated using(
      bucket_id='kira-character-portraits' and exists(select 1 from public.character_portraits p where p.storage_path=name and private.can_read_author(p.author_id)))$policy$;
    execute $policy$create policy kira_portrait_upload on storage.objects for insert to authenticated with check(
      bucket_id='kira-character-portraits' and exists(select 1 from public.character_portraits p where p.storage_path=name and p.status='uploading' and p.permission_granted_by=auth.uid() and private.can_edit_author(p.author_id)))$policy$;
    execute $policy$create policy kira_portrait_delete on storage.objects for delete to authenticated using(
      bucket_id='kira-character-portraits' and exists(select 1 from public.character_portraits p where p.storage_path=name and private.can_edit_author(p.author_id)))$policy$;
    -- Restrictive guards prevent unrelated permissive Storage policies from
    -- exposing this bucket or allowing overwrite by another workspace.
    execute $policy$create policy kira_portrait_read_guard on storage.objects as restrictive for select to authenticated using(
      bucket_id<>'kira-character-portraits' or exists(select 1 from public.character_portraits p where p.storage_path=name and private.can_read_author(p.author_id)))$policy$;
    execute $policy$create policy kira_portrait_upload_guard on storage.objects as restrictive for insert to authenticated with check(
      bucket_id<>'kira-character-portraits' or exists(select 1 from public.character_portraits p where p.storage_path=name and p.status='uploading' and p.permission_granted_by=auth.uid() and private.can_edit_author(p.author_id)))$policy$;
    execute $policy$create policy kira_portrait_delete_guard on storage.objects as restrictive for delete to authenticated using(
      bucket_id<>'kira-character-portraits' or exists(select 1 from public.character_portraits p where p.storage_path=name and private.can_edit_author(p.author_id)))$policy$;
    execute $policy$create policy kira_portrait_no_overwrite on storage.objects as restrictive for update to authenticated using(bucket_id<>'kira-character-portraits') with check(bucket_id<>'kira-character-portraits')$policy$;
    execute $policy$create policy kira_portrait_no_anonymous on storage.objects as restrictive for all to anon using(bucket_id<>'kira-character-portraits') with check(bucket_id<>'kira-character-portraits')$policy$;
  end if;
end $$;

comment on table public.character_profiles is 'Author-owned character identity scoped to the workspace, not to one book. Created and renamed by the author; never inferred from a manuscript.';
comment on table public.character_profile_links is 'Explicit, reversible, author-confirmed link between a profile and one book-scoped character. A shared name is not proof of identity.';
comment on table public.character_notes is 'Author-written context, separated into confirmed detail and visual inspiration. Manuscript-derived observations stay in public.book_characters with citations.';
comment on table public.character_portraits is 'Private author-uploaded images with retained source, credit and usage permission. A portrait is inspiration, never evidence for a statement about a book.';
