-- Durable, bounded manuscript reading. The queue carries identifiers only.
create table public.manuscript_reading_jobs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  state text not null default 'queued' check(state in ('queued','running','paused','needs_attention','complete')),
  run_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index manuscript_one_active_job on public.manuscript_reading_jobs(manuscript_id) where state in ('queued','running');
alter table public.manuscript_reading_jobs enable row level security;
grant select on public.manuscript_reading_jobs to authenticated;
create policy reading_job_members on public.manuscript_reading_jobs for select to authenticated using(private.can_read_author(author_id));
alter table public.manuscript_batches add column reading_job_id uuid references public.manuscript_reading_jobs(id);
-- Both reservation functions lock the author row. The worker additionally caps pending batches at two.
drop index public.manuscript_one_pending;
create index manuscript_pending on public.manuscript_batches(author_id,manuscript_id) where status='pending';

create function private.manuscript_reading_control(p_author_id uuid,p_id uuid,p_action text,p_retry boolean,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.manuscripts; j public.manuscript_reading_jobs; begin
  perform private.manuscript_writer(p_author_id,p_recording_key);
  perform 1 from public.authors where id=p_author_id for update;
  select * into m from public.manuscripts where id=p_id and author_id=p_author_id for update;
  if not found then raise exception 'Manuscript unavailable.' using errcode='P0002'; end if;
  if p_action not in ('start','pause') or p_action is null or p_retry is null then raise exception 'Invalid action.' using errcode='22023'; end if;
  if not private.manuscript_permission_valid(p_author_id,p_id) then raise exception 'Permission required.' using errcode='42501'; end if;
  select * into j from public.manuscript_reading_jobs where manuscript_id=p_id order by created_at desc limit 1 for update;
  if p_action='pause' then
    if j.state in ('queued','running') then update public.manuscript_reading_jobs set state='paused',updated_at=now() where id=j.id returning * into j; end if;
    return to_jsonb(j);
  end if;
  if m.status='ready' then return null; end if;
  if m.status='uploading' or m.chunk_count=0 then raise exception 'Upload must finish first.' using errcode='22023'; end if;
  if j.state in ('queued','running') and j.updated_at>now()-interval '3 minutes' then return to_jsonb(j); end if;
  if exists(select 1 from public.manuscript_batches where manuscript_id=p_id and status='pending' and created_at>now()-interval '2 minutes') then
    raise exception 'A reading step is still finishing.' using errcode='55P03';
  end if;
  if (m.status='failed' or exists(select 1 from public.manuscript_batches where manuscript_id=p_id and status='pending') or j.state in ('queued','running','needs_attention')) and not p_retry then
    raise exception 'An interrupted reading needs an explicit retry.' using errcode='40001';
  end if;
  update public.manuscript_batches set status='failed',error_code='interrupted',completed_at=now() where manuscript_id=p_id and status='pending';
  update public.manuscript_reading_jobs set state='paused',updated_at=now() where manuscript_id=p_id and state in ('queued','running');
  insert into public.manuscript_reading_jobs(author_id,manuscript_id,created_by) values(p_author_id,p_id,auth.uid()) returning * into j;
  update public.manuscripts set status='queued',error_code=null where id=p_id;
  return to_jsonb(j);
end $$;

-- This capability is server-only. It accepts a persisted job, never a caller-selected actor or tenant.
-- The actor is rechecked on every operation. No access/refresh tokens or manuscript text enter the queue.
create function private.manuscript_reading_worker(p_job_id uuid,p_run_id text,p_action text,p_batch_id uuid,p_payload jsonb,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.manuscript_reading_jobs; m public.manuscripts; b public.manuscript_batches; ids uuid[]; chunks jsonb; finished jsonb; begin
  perform private.assert_studio_recording_key(p_recording_key);
  if p_run_id is null or length(p_run_id) not between 1 and 200 or p_action not in ('claim','finish','attention') or p_action is null then raise exception 'Invalid worker request.' using errcode='22023'; end if;
  select * into j from public.manuscript_reading_jobs where id=p_job_id;
  if not found then raise exception 'Job unavailable.' using errcode='P0002'; end if;
  perform 1 from public.authors where id=j.author_id for update;
  select * into j from public.manuscript_reading_jobs where id=p_job_id for update;
  select * into m from public.manuscripts where id=j.manuscript_id and author_id=j.author_id for update;
  if not found then raise exception 'Manuscript unavailable.' using errcode='P0002'; end if;
  if j.run_id is not null and j.run_id<>p_run_id then return jsonb_build_object('state','superseded','created',false,'chunks','[]'::jsonb); end if;
  perform set_config('request.jwt.claim.sub',j.created_by::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',j.created_by::text,'role','authenticated')::text,true);
  if not private.can_edit_author(j.author_id) or not private.manuscript_permission_valid(j.author_id,j.manuscript_id) then
    update public.manuscript_reading_jobs set state='needs_attention',error_code='permission_required',updated_at=now() where id=j.id;
    return jsonb_build_object('state','needs_attention','created',false,'chunks','[]'::jsonb);
  end if;
  perform private.manuscript_writer(j.author_id,p_recording_key);
  if p_action='attention' then
    update public.manuscript_reading_jobs set state='needs_attention',error_code='interrupted',updated_at=now() where id=j.id and state in ('queued','running');
    return jsonb_build_object('state','needs_attention');
  end if;
  if p_batch_id is null then raise exception 'Batch required.' using errcode='22023'; end if;
  if p_action='finish' then
    select * into b from public.manuscript_batches where id=p_batch_id and reading_job_id=j.id;
    if not found then raise exception 'Batch unavailable.' using errcode='P0002'; end if;
    finished:=private.manuscript_finish_batch(j.author_id,j.manuscript_id,p_batch_id,nullif(p_payload->'result','null'::jsonb),p_payload->>'errorCode',p_payload->'usage',p_payload->'embeddings',p_recording_key);
    if finished->'manuscript'->>'status'='ready' then
      update public.manuscript_reading_jobs set state='complete',error_code=null,updated_at=now() where id=j.id;
    elsif finished->'batch'->>'status'='failed' then
      update public.manuscript_reading_jobs set state='needs_attention',error_code=finished->'batch'->>'error_code',updated_at=now() where id=j.id;
    else update public.manuscript_reading_jobs set updated_at=now() where id=j.id; end if;
  else
    if j.state not in ('queued','running') then return jsonb_build_object('state',j.state,'created',false,'chunks','[]'::jsonb); end if;
    update public.manuscript_reading_jobs set run_id=p_run_id,state='running',updated_at=now() where id=j.id;
    select * into b from public.manuscript_batches where id=p_batch_id;
    if found then
      if b.reading_job_id is distinct from j.id then raise exception 'Batch conflict.' using errcode='40001'; end if;
      -- A replay never repeats a paid model call. Unknown outcome needs a person to resume.
      if b.status<>'complete' then update public.manuscript_reading_jobs set state='needs_attention',error_code='interrupted',updated_at=now() where id=j.id; end if;
    elsif m.status='ready' then update public.manuscript_reading_jobs set state='complete',updated_at=now() where id=j.id;
    elsif m.status='failed' then update public.manuscript_reading_jobs set state='needs_attention',error_code=m.error_code,updated_at=now() where id=j.id;
    elsif (select count(*) from public.manuscript_batches where author_id=j.author_id and manuscript_id=j.manuscript_id and status='pending')<2 then
      if (select count(*) from public.manuscript_batches where author_id=j.author_id and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=150 then
        update public.manuscript_reading_jobs set state='needs_attention',error_code='daily_limit',updated_at=now() where id=j.id;
      else
        select array_agg(c.id order by c.chunk_index),jsonb_agg(jsonb_build_object('id',c.id,'chunk_index',c.chunk_index,'section',c.section,'reference_text',c.reference_text,'content_hash',c.content_hash) order by c.chunk_index)
        into ids,chunks from (select k.* from public.knowledge_chunks k where k.author_id=j.author_id and k.manuscript_id=j.manuscript_id
          and not exists(select 1 from public.manuscript_batches x where x.manuscript_id=j.manuscript_id and x.status in ('pending','complete') and k.id=any(x.chunk_ids)) order by k.chunk_index limit 4) c;
        if ids is not null then
          insert into public.manuscript_batches(id,author_id,manuscript_id,created_by,chunk_ids,reading_job_id) values(p_batch_id,j.author_id,j.manuscript_id,j.created_by,ids,j.id);
          update public.manuscripts set status='processing',error_code=null where id=m.id;
          return jsonb_build_object('state','running','created',true,'chunks',chunks);
        end if;
      end if;
    end if;
  end if;
  select * into j from public.manuscript_reading_jobs where id=p_job_id;
  return jsonb_build_object('state',j.state,'created',false,'chunks','[]'::jsonb);
end $$;

create function public.manuscript_reading_control(p_author_id uuid,p_id uuid,p_action text,p_retry boolean,p_recording_key text)
returns jsonb language sql security invoker set search_path='' as $$ select private.manuscript_reading_control(p_author_id,p_id,p_action,p_retry,p_recording_key); $$;
create function public.manuscript_reading_worker(p_job_id uuid,p_run_id text,p_action text,p_batch_id uuid,p_payload jsonb,p_recording_key text)
returns jsonb language sql security invoker set search_path='' as $$ select private.manuscript_reading_worker(p_job_id,p_run_id,p_action,p_batch_id,p_payload,p_recording_key); $$;
revoke all on function private.manuscript_reading_control(uuid,uuid,text,boolean,text),public.manuscript_reading_control(uuid,uuid,text,boolean,text) from public,anon;
grant execute on function private.manuscript_reading_control(uuid,uuid,text,boolean,text),public.manuscript_reading_control(uuid,uuid,text,boolean,text) to authenticated;
revoke all on function private.manuscript_reading_worker(uuid,text,text,uuid,jsonb,text),public.manuscript_reading_worker(uuid,text,text,uuid,jsonb,text) from public,authenticated;
grant usage on schema private to anon;
grant execute on function private.manuscript_reading_worker(uuid,text,text,uuid,jsonb,text),public.manuscript_reading_worker(uuid,text,text,uuid,jsonb,text) to anon;
