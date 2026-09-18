-- Authenticated workspace operations. Every public RPC runs as its caller and
-- preserves the original RLS, tenant foreign keys and evidence validation.
-- No synthetic data or credentials are introduced by this migration.

-- Protect the review's source snapshot even when a member uses PostgREST table
-- writes directly. Only the draft and review decision can change; edits need a
-- separate subsequent approval, and every successful change advances a version.
create or replace function private.approval_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.version <> 0 then raise exception 'Approval must begin pending at version zero'; end if;
  else
    if old.status <> 'pending' then raise exception 'Reviewed approvals are immutable'; end if;
    if new.version <> old.version + 1 then raise exception 'Approval version must increment exactly once'; end if;
    if new.author_id is distinct from old.author_id or new.id is distinct from old.id
      or new.created_at is distinct from old.created_at then raise exception 'Approval identity is immutable'; end if;
    if new.recommendation_id is distinct from old.recommendation_id or new.type is distinct from old.type
      or new.title is distinct from old.title or new.description is distinct from old.description
      or new.evidence is distinct from old.evidence or new.data_origin is distinct from old.data_origin then
      raise exception 'Approval provenance and review context are immutable';
    end if;
    if new.draft is distinct from old.draft and new.status <> 'pending' then
      raise exception 'Edited drafts must remain pending for a separate review';
    end if;
  end if;
  return new;
end;
$$;

create table public.approval_events (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete restrict,
  approval_request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('created','edited','approved','rejected')),
  previous_version integer,
  version integer not null,
  created_at timestamptz not null default now(),
  foreign key(author_id,approval_request_id) references public.approval_requests(author_id,id)
);
alter table public.approval_events enable row level security;
create policy approval_events_read on public.approval_events for select to authenticated
  using(private.can_read_author(author_id));
revoke all on public.approval_events from public, anon, authenticated;
grant select on public.approval_events to authenticated;
create index approval_events_request_idx on public.approval_events(author_id,approval_request_id,created_at);

-- This trigger alone may append audit events. There is no callable write API or
-- insert/update/delete grant for members. Administrative bootstrap has no actor.
create function private.record_approval_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    insert into public.approval_events(author_id,approval_request_id,user_id,action,previous_version,version)
    values(new.author_id,new.id,auth.uid(),
      case when tg_op = 'INSERT' then 'created'
        when new.status = 'approved' then 'approved'
        when new.status = 'rejected' then 'rejected' else 'edited' end,
      case when tg_op = 'INSERT' then null else old.version end,new.version);
  end if;
  return new;
end;
$$;
revoke all on function private.record_approval_event() from public, anon, authenticated;
create trigger record_approval_event after insert or update on public.approval_requests
  for each row execute function private.record_approval_event();

create function public.decide_approval(
  p_author_id uuid, p_approval_id uuid, p_action text, p_expected_version integer,
  p_draft text default null
) returns public.approval_requests language plpgsql security invoker set search_path = '' as $$
declare request public.approval_requests;
begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('approve','reject','edit') then
    raise exception 'Unknown approval action' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'An expected version is required' using errcode = '22023';
  end if;
  select * into request from public.approval_requests
    where author_id = p_author_id and id = p_approval_id and data_origin <> 'demo' for update;
  if not found then raise exception 'Approval request not found' using errcode = 'P0002'; end if;
  if request.version <> p_expected_version then
    raise exception 'This request changed. Reload before reviewing.' using errcode = '40001';
  end if;
  if request.status <> 'pending' then
    raise exception 'Reviewed approvals are immutable' using errcode = '22023';
  end if;
  if p_action = 'edit' and (p_draft is null or length(trim(p_draft)) not between 1 and 10000) then
    raise exception 'Draft must contain between 1 and 10000 characters' using errcode = '22023';
  end if;
  update public.approval_requests set
    status = case p_action when 'approve' then 'approved'::public.approval_status
      when 'reject' then 'rejected'::public.approval_status else 'pending'::public.approval_status end,
    draft = case when p_action = 'edit' then trim(p_draft) else draft end,
    version = version + 1
    where author_id = p_author_id and id = p_approval_id
    returning * into request;
  return request;
end;
$$;

create function public.teach_raven(p_author_id uuid, p_approval_id uuid, p_feedback text)
returns public.human_feedback language plpgsql security invoker set search_path = '' as $$
declare lesson public.human_feedback;
begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if p_feedback is null or length(trim(p_feedback)) not between 1 and 4000 then
    raise exception 'Lesson must contain between 1 and 4000 characters' using errcode = '22023';
  end if;
  perform 1 from public.approval_requests
    where author_id = p_author_id and id = p_approval_id and data_origin <> 'demo';
  if not found then raise exception 'Approval request not found' using errcode = 'P0002'; end if;
  insert into public.human_feedback(author_id,approval_request_id,user_id,feedback,scope,data_origin)
    values(p_author_id,p_approval_id,auth.uid(),trim(p_feedback),'author_workspace','manual')
    returning * into lesson;
  return lesson;
end;
$$;

create function public.queue_recommendation(p_author_id uuid, p_recommendation_id uuid)
returns public.approval_requests language plpgsql security invoker set search_path = '' as $$
declare recommendation public.agent_recommendations; request public.approval_requests;
begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  -- Lock the stored recommendation: simultaneous queues share one approval, and
  -- the caller cannot inject a different title, draft, evidence or provenance.
  select * into recommendation from public.agent_recommendations
    where author_id = p_author_id and id = p_recommendation_id and data_origin <> 'demo' for update;
  if not found then raise exception 'Recommendation not found' using errcode = 'P0002'; end if;
  select * into request from public.approval_requests
    where author_id = p_author_id and recommendation_id = p_recommendation_id;
  if not found then
    insert into public.approval_requests(author_id,recommendation_id,type,title,description,draft,evidence,data_origin)
    values(p_author_id,recommendation.id,'campaign',recommendation.title,recommendation.description,
      'CAMPAIGN BRIEF' || E'\n\nObjective: ' || recommendation.objective || E'\n\nDirection: ' || recommendation.description ||
      E'\n\nWhy: ' || recommendation.reason || E'\n\nNext: Cassandra reviews the sources and approved assets. This decision authorizes no publication, outreach, or spending.',
      recommendation.evidence,recommendation.data_origin)
    returning * into request;
  end if;
  update public.agent_recommendations set status = 'queued'
    where author_id = p_author_id and id = p_recommendation_id and status <> 'queued';
  return request;
end;
$$;

create function public.dismiss_recommendation(p_author_id uuid, p_recommendation_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  update public.agent_recommendations set status = 'dismissed'
    where author_id = p_author_id and id = p_recommendation_id and data_origin <> 'demo';
  if not found then raise exception 'Recommendation not found' using errcode = 'P0002'; end if;
end;
$$;

create function public.restore_recommendations(p_author_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  update public.agent_recommendations r set status = case when exists(
    select 1 from public.approval_requests a where a.author_id = p_author_id and a.recommendation_id = r.id
  ) then 'queued' else 'suggested' end
    where r.author_id = p_author_id and r.status = 'dismissed' and r.data_origin <> 'demo';
end;
$$;

-- A person's business brief is useful on day one without pretending an agent
-- generated it. The original text remains an attributed source snapshot.
create function public.create_manual_review(p_author_id uuid, p_title text, p_draft text)
returns public.approval_requests language plpgsql security invoker set search_path = '' as $$
declare source_id uuid; request public.approval_requests; submitted_at timestamptz := now();
begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 then
    raise exception 'Title must contain between 1 and 200 characters' using errcode = '22023';
  end if;
  if p_draft is null or length(trim(p_draft)) not between 1 and 10000 then
    raise exception 'Draft must contain between 1 and 10000 characters' using errcode = '22023';
  end if;
  insert into public.sources(author_id,name,source_type,retrieved_at,metadata,data_origin)
    values(p_author_id,'Member-supplied business brief','human_feedback',submitted_at,
      jsonb_build_object('submitted_by',auth.uid(),'purpose','manual_business_review'),'manual')
    returning id into source_id;
  insert into public.approval_requests(author_id,type,title,description,draft,evidence,data_origin)
    values(p_author_id,'campaign',trim(p_title),
      'A member-supplied business brief for Cassandra to review. No external action is authorized.',trim(p_draft),
      jsonb_build_array(jsonb_build_object(
        'id',gen_random_uuid(),'source_id',source_id,'source','Member-supplied business brief',
        'source_type','human_feedback','retrieved_at',submitted_at,'excerpt_or_metric',trim(p_draft),
        'metadata',jsonb_build_object('submitted_by',auth.uid(),'purpose','manual_business_review'),
        'data_origin','manual')),'manual')
    returning * into request;
  return request;
end;
$$;

revoke all on function public.decide_approval(uuid,uuid,text,integer,text),
  public.teach_raven(uuid,uuid,text), public.queue_recommendation(uuid,uuid),
  public.dismiss_recommendation(uuid,uuid), public.restore_recommendations(uuid),
  public.create_manual_review(uuid,text,text) from public, anon;
grant execute on function public.decide_approval(uuid,uuid,text,integer,text),
  public.teach_raven(uuid,uuid,text), public.queue_recommendation(uuid,uuid),
  public.dismiss_recommendation(uuid,uuid), public.restore_recommendations(uuid),
  public.create_manual_review(uuid,text,text) to authenticated;
