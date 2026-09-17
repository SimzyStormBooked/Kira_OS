-- KIRA OS Phase One. Supabase owns auth.users and auth.uid().
-- All tenant relationships use (author_id, id) foreign keys.
create schema if not exists private;
create type public.data_origin as enum ('demo', 'manual', 'public_verified');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.tactic_status as enum ('EXPERIMENTAL', 'WORKING', 'DECLINING', 'STALE', 'RETIRED');

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  website text, instagram_handle text,
  data_origin public.data_origin not null default 'manual',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.author_members (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(author_id, user_id)
);
create function private.can_read_author(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.authors where id = target and owner_user_id = (select auth.uid()))
    or exists(select 1 from public.author_members where author_id = target and user_id = (select auth.uid()));
$$;
create function private.can_edit_author(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.authors where id = target and owner_user_id = (select auth.uid()))
    or exists(select 1 from public.author_members where author_id = target and user_id = (select auth.uid()) and role = 'editor');
$$;
create function private.owns_author(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.authors where id = target and owner_user_id = (select auth.uid()));
$$;
revoke all on function private.can_read_author(uuid), private.can_edit_author(uuid), private.owns_author(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_read_author(uuid), private.can_edit_author(uuid), private.owns_author(uuid) to authenticated;

create table public.sources (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  name text not null, source_type text not null check (source_type in ('synthetic','website','manual_snapshot','human_feedback','document','api')),
  url text, retrieved_at timestamptz not null, captured_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  check (source_type <> 'synthetic' or data_origin = 'demo')
);
create table public.universes (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  name text not null, description text, data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id)
);
create table public.series (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  universe_id uuid, source_id uuid, name text not null, verification_notes text,
  data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,universe_id) references public.universes(author_id,id),
  foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.books (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  series_id uuid, source_id uuid not null, slug text not null, title text not null, series_order integer check(series_order > 0),
  overview text, cover_url text, verified_at timestamptz, verified_fields text[] not null default '{}',
  verification_status text not null default 'needs_verification' check(verification_status in ('needs_verification','partial','verified')),
  data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id), unique(author_id,slug),
  foreign key(author_id,series_id) references public.series(author_id,id), foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.characters (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  book_id uuid not null, source_id uuid not null, name text not null, approved_description text,
  verified_at timestamptz, data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,book_id) references public.books(author_id,id), foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.relationships (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  from_character_id uuid not null, to_character_id uuid not null, source_id uuid not null, description text not null,
  verified_at timestamptz, data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,from_character_id) references public.characters(author_id,id), foreign key(author_id,to_character_id) references public.characters(author_id,id),
  foreign key(author_id,source_id) references public.sources(author_id,id), check(from_character_id <> to_character_id)
);
create table public.tropes (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  name text not null, data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id), unique(author_id,name)
);
create table public.themes (like public.tropes including all);
alter table public.themes add foreign key(author_id) references public.authors(id) on delete cascade;
create table public.book_tropes (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  book_id uuid not null, trope_id uuid not null, source_id uuid not null, verified_at timestamptz,
  data_origin public.data_origin not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(author_id,book_id,trope_id), foreign key(author_id,book_id) references public.books(author_id,id),
  foreign key(author_id,trope_id) references public.tropes(author_id,id), foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.book_themes (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  book_id uuid not null, theme_id uuid not null, source_id uuid not null, verified_at timestamptz,
  data_origin public.data_origin not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(author_id,book_id,theme_id), foreign key(author_id,book_id) references public.books(author_id,id),
  foreign key(author_id,theme_id) references public.themes(author_id,id), foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  book_id uuid, source_id uuid not null, name text not null, product_type text not null, purchase_url text,
  verified_at timestamptz, data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,book_id) references public.books(author_id,id), foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.content_assets (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  book_id uuid, source_id uuid not null, title text not null, storage_path text, asset_type text not null,
  rights_status text not null default 'unverified' check(rights_status in ('unverified','approved','restricted')),
  read_only boolean not null default true check(read_only = true), data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,book_id) references public.books(author_id,id), foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  source_id uuid not null, platform text not null, handle text not null, followers bigint check(followers >= 0), posts bigint check(posts >= 0),
  snapshot_at timestamptz, is_live boolean not null default false check(is_live = false), data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,source_id) references public.sources(author_id,id)
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  name text not null, objective text not null, status text not null default 'draft' check(status in ('draft','reviewed','archived')),
  data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id)
);
create table public.agent_definitions (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  name text not null, role text not null, provider text not null default 'demo', model text,
  mode text not null default 'not_connected' check(mode in ('not_connected','deterministic')),
  data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id)
);
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  agent_id uuid not null, provider text not null, model text not null,
  status text not null check(status in ('running','completed','failed')), started_at timestamptz not null default now(), completed_at timestamptz,
  input_finding_ids uuid[] not null default '{}', error text, data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,agent_id) references public.agent_definitions(author_id,id),
  check(completed_at is null or completed_at >= started_at)
);
create table public.agent_findings (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  agent_id uuid not null, run_id uuid, type text not null, title text not null, summary text not null,
  confidence numeric not null check(confidence between 0 and 1), evidence jsonb not null check(jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  source_ids uuid[] not null check(cardinality(source_ids) > 0), requires_human_review boolean not null default true check(requires_human_review),
  status text not null default 'new' check(status in ('new','reviewed','dismissed')), data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,agent_id) references public.agent_definitions(author_id,id), foreign key(author_id,run_id) references public.agent_runs(author_id,id)
);
create table public.agent_recommendations (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  agent_id uuid not null, finding_id uuid not null, title text not null, description text not null, reason text not null, objective text not null,
  confidence numeric not null check(confidence between 0 and 1), effort text not null check(effort in ('low','medium','high')),
  priority_score integer not null, evidence jsonb not null check(jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  source text not null, status text not null default 'suggested' check(status in ('suggested','queued','dismissed')), data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,agent_id) references public.agent_definitions(author_id,id), foreign key(author_id,finding_id) references public.agent_findings(author_id,id)
);
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  recommendation_id uuid, type text not null check(type in ('social','outreach','trope','metadata','seo','campaign')),
  title text not null, description text not null, draft text not null check(length(trim(draft)) between 1 and 10000),
  status public.approval_status not null default 'pending', version integer not null default 0 check(version >= 0),
  evidence jsonb not null check(jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id), unique(author_id,recommendation_id),
  foreign key(author_id,recommendation_id) references public.agent_recommendations(author_id,id)
);
create table public.human_feedback (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  approval_request_id uuid not null, user_id uuid default auth.uid() references auth.users(id),
  feedback text not null check(length(trim(feedback)) between 1 and 4000),
  scope text not null check(scope in ('demo_workspace','author_workspace')),
  data_origin public.data_origin not null default 'manual' check(data_origin = 'manual'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  foreign key(author_id,approval_request_id) references public.approval_requests(author_id,id)
);
create table public.tactic_memory (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  tactic text not null, channel text not null, objective text not null, first_used timestamptz, last_used timestamptz,
  historical_performance jsonb not null default '{}', recent_performance jsonb not null default '{}',
  performance_trend text not null default 'unknown' check(performance_trend in ('unknown','up','flat','down')),
  context text not null, confidence numeric not null check(confidence between 0 and 1), status public.tactic_status not null default 'EXPERIMENTAL',
  evidence jsonb not null check(jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0), data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,id),
  check(last_used is null or first_used is null or last_used >= first_used)
);

-- Evidence is an immutable-at-source snapshot embedded in each conclusion.
-- Validate source ownership and origin at the database boundary as well as in TypeScript.
create function private.validate_evidence() returns trigger language plpgsql set search_path = '' as $$
declare item jsonb; source_origin public.data_origin; source_kind text;
begin
  for item in select value from jsonb_array_elements(new.evidence) loop
    if not (item ?& array['id','source_id','source','source_type','retrieved_at','excerpt_or_metric','metadata','data_origin']) then
      raise exception 'Evidence is missing required provenance fields';
    end if;
    if nullif(trim(item->>'id'),'') is null or nullif(trim(item->>'source_id'),'') is null
      or nullif(trim(item->>'source'),'') is null or nullif(trim(item->>'source_type'),'') is null
      or nullif(trim(item->>'retrieved_at'),'') is null or nullif(trim(item->>'data_origin'),'') is null
      or nullif(trim(item->>'excerpt_or_metric'),'') is null or jsonb_typeof(item->'metadata') is distinct from 'object' then
      raise exception 'Evidence fields must contain valid nonempty provenance';
    end if;
    perform (item->>'id')::uuid;
    perform (item->>'retrieved_at')::timestamptz;
    if length(trim(item->>'excerpt_or_metric')) = 0 then raise exception 'Empty evidence'; end if;
    select data_origin, source_type into source_origin, source_kind from public.sources where author_id = new.author_id and id = (item->>'source_id')::uuid;
    if not found then raise exception 'Evidence source is missing or belongs to another author'; end if;
    if source_origin::text <> item->>'data_origin' or source_kind <> item->>'source_type' then raise exception 'Evidence origin must match its source'; end if;
    if source_origin = 'demo' and new.data_origin <> 'demo' then raise exception 'Demo evidence requires a demo conclusion'; end if;
    if tg_table_name = 'agent_findings' then
      if not ((item->>'source_id')::uuid = any(new.source_ids)) then raise exception 'Evidence source is not declared'; end if;
    end if;
  end loop;
  return new;
end;
$$;
create function private.approval_transition() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.version <> 0 then raise exception 'Approval must begin pending at version zero'; end if;
  else
    if old.status <> 'pending' then raise exception 'Reviewed approvals are immutable'; end if;
    if new.version <> old.version + 1 then raise exception 'Approval version must increment exactly once'; end if;
    if new.author_id <> old.author_id or new.id <> old.id or new.created_at <> old.created_at then raise exception 'Approval identity is immutable'; end if;
  end if;
  return new;
end;
$$;
create trigger approval_transition before insert or update on public.approval_requests for each row execute function private.approval_transition();
create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;

-- No anonymous policies. Every table is scoped to an authenticated author membership.
alter table public.authors enable row level security;
create policy author_read on public.authors for select to authenticated using(private.can_read_author(id));
create policy author_insert on public.authors for insert to authenticated with check(owner_user_id = (select auth.uid()));
create policy author_update on public.authors for update to authenticated using(private.owns_author(id)) with check(owner_user_id = (select auth.uid()));
alter table public.author_members enable row level security;
create policy members_read on public.author_members for select to authenticated using(private.can_read_author(author_id));
create policy members_manage on public.author_members for all to authenticated using(private.owns_author(author_id)) with check(private.owns_author(author_id));

do $$
declare tbl text;
begin
  foreach tbl in array array['sources','universes','series','books','characters','relationships','tropes','themes','book_tropes','book_themes','products','content_assets','social_accounts','campaigns','agent_definitions','agent_runs','agent_findings','agent_recommendations','approval_requests','human_feedback','tactic_memory'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('create policy tenant_read on public.%I for select to authenticated using(private.can_read_author(author_id))',tbl);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check(private.can_edit_author(author_id))',tbl);
    if tbl not in ('human_feedback','sources') then
      execute format('create policy tenant_update on public.%I for update to authenticated using(private.can_edit_author(author_id)) with check(private.can_edit_author(author_id))',tbl);
    end if;
    -- Sources, feedback and approval history are append-only / retained, with no DELETE policy.
    if tbl not in ('human_feedback','sources','approval_requests','agent_findings','agent_recommendations','agent_runs') then
      execute format('create policy tenant_delete on public.%I for delete to authenticated using(private.can_edit_author(author_id))',tbl);
    end if;
    execute format('create index %I on public.%I(author_id)',tbl || '_author_idx',tbl);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',tbl);
  end loop;
  foreach tbl in array array['agent_findings','agent_recommendations','approval_requests','tactic_memory'] loop
    execute format('create trigger validate_evidence before insert or update on public.%I for each row execute function private.validate_evidence()',tbl);
  end loop;
end;
$$;
-- Feedback is attributed to the authenticated writer; members cannot impersonate each other.
drop policy tenant_insert on public.human_feedback;
create policy feedback_insert on public.human_feedback for insert to authenticated
  with check(private.can_edit_author(author_id) and user_id = (select auth.uid()));
create index approvals_queue_idx on public.approval_requests(author_id,status,created_at desc);
create index findings_inbox_idx on public.agent_findings(author_id,status,created_at desc);
create index feedback_approval_idx on public.human_feedback(author_id,approval_request_id,created_at);
create trigger authors_updated_at before update on public.authors for each row execute function private.touch_updated_at();
create trigger members_updated_at before update on public.author_members for each row execute function private.touch_updated_at();
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
