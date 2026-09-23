-- One recorded automatic recovery per exact passage set, including across resumed jobs.
alter table public.manuscript_batches add column recovery_of_batch_id uuid
  references public.manuscript_batches(id);
create unique index manuscript_one_recovery_per_batch on public.manuscript_batches(recovery_of_batch_id)
  where recovery_of_batch_id is not null;
create function private.manuscript_chunk_set(p_ids uuid[]) returns uuid[]
language sql immutable parallel safe set search_path='' as $$
  select array_agg(id order by id) from unnest(p_ids) as ids(id);
$$;
revoke all on function private.manuscript_chunk_set(uuid[]) from public,anon,authenticated;
create unique index manuscript_one_recovery_per_chunk_set
  on public.manuscript_batches(manuscript_id,private.manuscript_chunk_set(chunk_ids))
  where recovery_of_batch_id is not null;

create or replace function private.manuscript_reading_worker(p_job_id uuid,p_run_id text,p_action text,p_batch_id uuid,p_payload jsonb,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  j public.manuscript_reading_jobs;
  m public.manuscripts;
  b public.manuscript_batches;
  ids uuid[];
  chunks jsonb;
  finished jsonb;
  recovery_id uuid;
begin
  perform private.assert_studio_recording_key(p_recording_key);
  if p_run_id is null or length(p_run_id) not between 1 and 200 or p_action not in ('claim','finish','attention') or p_action is null then
    raise exception 'Invalid worker request.' using errcode='22023';
  end if;
  select * into j from public.manuscript_reading_jobs where id=p_job_id;
  if not found then raise exception 'Job unavailable.' using errcode='P0002'; end if;
  -- Control, normal claims, and recovery reservations all take this same lock first.
  perform 1 from public.authors where id=j.author_id for update;
  select * into j from public.manuscript_reading_jobs where id=p_job_id for update;
  select * into m from public.manuscripts where id=j.manuscript_id and author_id=j.author_id for update;
  if not found then raise exception 'Manuscript unavailable.' using errcode='P0002'; end if;
  if j.run_id is not null and j.run_id<>p_run_id then
    return jsonb_build_object('state','superseded','created',false,'chunks','[]'::jsonb);
  end if;
  perform set_config('request.jwt.claim.sub',j.created_by::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',j.created_by::text,'role','authenticated')::text,true);
  if not private.can_edit_author(j.author_id) or not private.manuscript_permission_valid(j.author_id,j.manuscript_id) then
    update public.manuscript_reading_jobs set state='needs_attention',error_code='permission_required',updated_at=now() where id=j.id;
    return jsonb_build_object('state','needs_attention','created',false,'chunks','[]'::jsonb);
  end if;
  perform private.manuscript_writer(j.author_id,p_recording_key);
  if p_action='attention' then
    update public.manuscript_reading_jobs set state='needs_attention',error_code='interrupted',updated_at=now()
      where id=j.id and state in ('queued','running');
    select * into j from public.manuscript_reading_jobs where id=p_job_id;
    return jsonb_build_object('state',j.state,'created',false,'chunks','[]'::jsonb);
  end if;
  if p_batch_id is null then raise exception 'Batch required.' using errcode='22023'; end if;
  if p_action='finish' then
    select * into b from public.manuscript_batches where id=p_batch_id and reading_job_id=j.id for update;
    if not found then raise exception 'Batch unavailable.' using errcode='P0002'; end if;
    if b.status<>'pending' then
      -- Replayed writes never resurrect an old failure or authorize another paid call.
      -- A lost reservation response leaves an uncertain pending recovery for attention.
      return jsonb_build_object('state',j.state,'created',false,'chunks','[]'::jsonb,
        'recoveryPending',exists(select 1 from public.manuscript_batches x
          where x.recovery_of_batch_id=b.id and x.status='pending'));
    end if;
    if p_payload->>'recoveryBatchId' is not null then
      recovery_id:=(p_payload->>'recoveryBatchId')::uuid;
      if recovery_id=b.id then raise exception 'Recovery requires a new batch.' using errcode='22023'; end if;
    end if;
    finished:=private.manuscript_finish_batch(j.author_id,j.manuscript_id,p_batch_id,
      nullif(p_payload->'result','null'::jsonb),p_payload->>'errorCode',p_payload->'usage',p_payload->'embeddings',p_recording_key);

    if j.state in ('queued','running') and m.status<>'failed' and recovery_id is not null
      and b.recovery_of_batch_id is null and finished->'batch'->>'error_code'='invalid_output'
      and not exists(select 1 from public.manuscript_batches x
        where x.manuscript_id=j.manuscript_id and x.recovery_of_batch_id is not null
          and private.manuscript_chunk_set(x.chunk_ids)=private.manuscript_chunk_set(b.chunk_ids))
      and not exists(select 1 from public.manuscript_batches x
        where x.manuscript_id=j.manuscript_id and x.status in ('pending','complete') and x.chunk_ids && b.chunk_ids)
      and (select count(*) from public.manuscript_batches where author_id=j.author_id and manuscript_id=j.manuscript_id and status='pending')<2 then
      if (select count(*) from public.manuscript_batches where author_id=j.author_id
        and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=150 then
        update public.manuscript_reading_jobs set state='needs_attention',error_code='daily_limit',updated_at=now() where id=j.id;
      else
        -- The failed attempt and its usage commit together with a distinct reservation.
        -- Replacing the just-finished pending row consumes no additional worker slot.
        insert into public.manuscript_batches(id,author_id,manuscript_id,created_by,chunk_ids,reading_job_id,recovery_of_batch_id)
          values(recovery_id,j.author_id,j.manuscript_id,j.created_by,b.chunk_ids,j.id,b.id);
        select jsonb_agg(jsonb_build_object('id',c.id,'chunk_index',c.chunk_index,'section',c.section,
          'reference_text',c.reference_text,'content_hash',c.content_hash) order by c.chunk_index)
          into chunks from public.knowledge_chunks c
          where c.author_id=j.author_id and c.manuscript_id=j.manuscript_id and c.id=any(b.chunk_ids);
        update public.manuscripts set status='processing',error_code=null where id=m.id;
        update public.manuscript_reading_jobs set state='running',error_code=null,updated_at=now() where id=j.id;
        return jsonb_build_object('state','running','created',true,'recoveryBatchId',recovery_id,'chunks',chunks);
      end if;
    elsif j.state in ('queued','running') then
      if finished->'manuscript'->>'status'='ready' then
        update public.manuscript_reading_jobs set state='complete',error_code=null,updated_at=now() where id=j.id;
      elsif finished->'batch'->>'status'='failed' then
        update public.manuscript_reading_jobs set state='needs_attention',error_code=finished->'batch'->>'error_code',updated_at=now() where id=j.id;
      else
        update public.manuscript_reading_jobs set updated_at=now() where id=j.id;
      end if;
    else
      -- Pause and an earlier terminal failure remain authoritative over sibling finishes.
      if m.status='failed' then
        update public.manuscripts set status=m.status,error_code=m.error_code where id=m.id;
      end if;
      update public.manuscript_reading_jobs set updated_at=now() where id=j.id;
    end if;
  else
    if j.state not in ('queued','running') then
      return jsonb_build_object('state',j.state,'created',false,'chunks','[]'::jsonb);
    end if;
    update public.manuscript_reading_jobs set run_id=p_run_id,state='running',updated_at=now() where id=j.id;
    select * into b from public.manuscript_batches where id=p_batch_id;
    if found then
      if b.reading_job_id is distinct from j.id then raise exception 'Batch conflict.' using errcode='40001'; end if;
      -- A replay never repeats a paid model call. Unknown outcome needs a person to resume.
      if b.status<>'complete' then
        update public.manuscript_reading_jobs set state='needs_attention',error_code='interrupted',updated_at=now() where id=j.id;
      end if;
    elsif m.status='ready' then
      update public.manuscript_reading_jobs set state='complete',updated_at=now() where id=j.id;
    elsif m.status='failed' then
      update public.manuscript_reading_jobs set state='needs_attention',error_code=m.error_code,updated_at=now() where id=j.id;
    elsif (select count(*) from public.manuscript_batches where author_id=j.author_id and manuscript_id=j.manuscript_id and status='pending')<2 then
      if (select count(*) from public.manuscript_batches where author_id=j.author_id
        and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=150 then
        update public.manuscript_reading_jobs set state='needs_attention',error_code='daily_limit',updated_at=now() where id=j.id;
      else
        select array_agg(c.id order by c.chunk_index),jsonb_agg(jsonb_build_object('id',c.id,'chunk_index',c.chunk_index,
          'section',c.section,'reference_text',c.reference_text,'content_hash',c.content_hash) order by c.chunk_index)
          into ids,chunks from (select k.* from public.knowledge_chunks k where k.author_id=j.author_id and k.manuscript_id=j.manuscript_id
            and not exists(select 1 from public.manuscript_batches x where x.manuscript_id=j.manuscript_id
              and x.status in ('pending','complete') and k.id=any(x.chunk_ids)) order by k.chunk_index limit 4) c;
        if ids is not null then
          insert into public.manuscript_batches(id,author_id,manuscript_id,created_by,chunk_ids,reading_job_id)
            values(p_batch_id,j.author_id,j.manuscript_id,j.created_by,ids,j.id);
          update public.manuscripts set status='processing',error_code=null where id=m.id;
          return jsonb_build_object('state','running','created',true,'chunks',chunks);
        end if;
      end if;
    end if;
  end if;
  select * into j from public.manuscript_reading_jobs where id=p_job_id;
  return jsonb_build_object('state',j.state,'created',false,'chunks','[]'::jsonb);
end $$;
