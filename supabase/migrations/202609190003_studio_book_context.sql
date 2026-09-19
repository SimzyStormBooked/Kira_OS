-- Bounded, permission-checked reference context. No browser may supply trusted evidence.
create function private.book_reference_context(a uuid,p_book_ids uuid[],question text,spoilers boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b record; f record; e jsonb:='[]';begin
 if not private.can_read_author(a) then raise exception 'Workspace unavailable' using errcode='42501';end if;
 if p_book_ids is null or cardinality(p_book_ids) not between 1 and 4 or spoilers is null or question is null or length(question)>6000 then raise exception 'Invalid selection' using errcode='22023';end if;
 if exists(select 1 from unnest(p_book_ids) requested(book_id) where not exists(select 1 from public.books checked_book where checked_book.id=requested.book_id and checked_book.author_id=a and checked_book.data_origin<>'demo')) then raise exception 'Book unavailable' using errcode='42501';end if;
 for b in select * from public.books where author_id=a and id=any(p_book_ids) order by id loop
  e:=e||jsonb_build_array(jsonb_build_object('id','book-'||b.id,'kind','book_metadata','label',b.title,'text',left(concat_ws(E'\n',b.title,b.overview,'Author-provided metadata: '||b.metadata::text),4000),'book_id',b.id,'source_id',b.source_id,'manuscript_id',null,'chunk_id',null));
  if b.active_manuscript_id is null or not private.manuscript_permission_valid(a,b.active_manuscript_id) then continue;end if;
  for f in select x.value,x.ordinality,k.id,k.source_id,k.section
   from public.book_intelligence bi cross join lateral jsonb_array_elements(bi.profile->'facts') with ordinality x(value,ordinality)
   join public.knowledge_chunks k on k.id=(x.value->'citations'->0->>'chunk_id')::uuid and k.author_id=a and k.manuscript_id=bi.manuscript_id
   where bi.author_id=a and bi.manuscript_id=b.active_manuscript_id and x.value->>'kind'='supported' and (spoilers or x.value->>'spoiler'='false')
   order by ts_rank(to_tsvector('english',x.value->>'statement'),plainto_tsquery('english',question)) desc,x.ordinality limit 8 loop
   e:=e||jsonb_build_array(jsonb_build_object('id','fact-'||b.id||'-'||f.ordinality,'kind','manuscript','label',b.title||' · '||f.section||' · '||(f.value->>'category'),'text','Unreviewed extracted observation: '||(f.value->>'statement')||E'\nSupporting passage: '||(f.value->'citations'->0->>'quote'),'book_id',b.id,'source_id',f.source_id,'manuscript_id',b.active_manuscript_id,'chunk_id',f.id));
  end loop;
  for f in select x.value,x.ordinality,k.id,k.source_id,k.section
   from public.book_intelligence bi cross join lateral jsonb_array_elements(bi.profile->'characters') with ordinality x(value,ordinality)
   join public.knowledge_chunks k on k.id=(x.value->'citations'->0->>'chunk_id')::uuid and k.author_id=a and k.manuscript_id=bi.manuscript_id
   where bi.author_id=a and bi.manuscript_id=b.active_manuscript_id and (spoilers or x.value->>'spoiler'='false')
   order by ts_rank(to_tsvector('english',x.value::text),plainto_tsquery('english',question)) desc,x.ordinality limit 4 loop
   e:=e||jsonb_build_array(jsonb_build_object('id','character-'||b.id||'-'||f.ordinality,'kind','manuscript','label',b.title||' · '||(f.value->>'name'),'text','Unreviewed extracted character record: '||left((f.value-'citations')::text,2500)||E'\nSupporting passage: '||(f.value->'citations'->0->>'quote'),'book_id',b.id,'source_id',f.source_id,'manuscript_id',b.active_manuscript_id,'chunk_id',f.id));
  end loop;
  if spoilers then
   for f in select k.id,k.source_id,k.section,k.reference_text from public.knowledge_chunks k where k.author_id=a and k.manuscript_id=b.active_manuscript_id
    order by ts_rank(to_tsvector('english',k.reference_text),plainto_tsquery('english',question)) desc,k.chunk_index limit 3 loop
    e:=e||jsonb_build_array(jsonb_build_object('id',f.id::text,'kind','manuscript','label',b.title||' · '||f.section,'text',f.reference_text,'book_id',b.id,'source_id',f.source_id,'manuscript_id',b.active_manuscript_id,'chunk_id',f.id));
   end loop;
  end if;
 end loop;
 return jsonb_build_object('book_ids',to_jsonb(p_book_ids),'include_spoilers',spoilers,'evidence',e);
end $$;
revoke all on function private.book_reference_context(uuid,uuid[],text,boolean) from public,anon,authenticated;
alter table public.workspace_generations add column knowledge_context jsonb not null default '{"book_ids":[],"include_spoilers":false,"evidence":[]}';
create function private.studio_reference_text(prompt text,context jsonb) returns text language sql immutable set search_path='' as $$
 select prompt||E'\n'||coalesce((select string_agg(e->>'text',E'\n') from jsonb_array_elements(context->'evidence') e),'');
$$;
revoke all on function private.studio_reference_text(text,jsonb) from public,anon,authenticated;
do $$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.workspace_generations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%valid_studio_output%' loop execute format('alter table public.workspace_generations drop constraint %I',c.conname);end loop;
end $$;
alter table public.workspace_generations add constraint studio_context_result_valid check(result is null or private.valid_studio_output(result,private.studio_reference_text(prompt,knowledge_context)));
create policy studio_source_permission on public.workspace_generations as restrictive for select to authenticated using(private.strategy_snapshot_allowed(author_id,knowledge_context));
create function private.workspace_generation_begin_context(p_author_id uuid,p_id uuid,p_job text,p_prompt text,p_recording_key text,p_books uuid[],p_spoilers boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;context jsonb;g public.workspace_generations;begin
 result:=private.workspace_generation_begin(p_author_id,p_id,p_job,p_prompt,p_recording_key);
 if not (result->>'created')::boolean then
  if (result->'generation'->'knowledge_context'->'book_ids') is distinct from to_jsonb(p_books) or (result->'generation'->'knowledge_context'->>'include_spoilers')::boolean is distinct from p_spoilers then raise exception 'Request selection changed' using errcode='40001';end if;
  return result;
 end if;
 context:=private.book_reference_context(p_author_id,p_books,p_prompt,p_spoilers);
 update public.workspace_generations set knowledge_context=context where id=p_id returning * into g;
 return jsonb_build_object('created',true,'generation',to_jsonb(g));
end $$;
create function public.workspace_generation_begin_context(p_author_id uuid,p_id uuid,p_job text,p_prompt text,p_recording_key text,p_books uuid[],p_spoilers boolean) returns jsonb language sql security invoker set search_path='' as $$
 select private.workspace_generation_begin_context(p_author_id,p_id,p_job,p_prompt,p_recording_key,p_books,p_spoilers);
$$;
revoke all on function private.workspace_generation_begin_context(uuid,uuid,text,text,text,uuid[],boolean),public.workspace_generation_begin_context(uuid,uuid,text,text,text,uuid[],boolean) from public,anon;
grant execute on function private.workspace_generation_begin_context(uuid,uuid,text,text,text,uuid[],boolean),public.workspace_generation_begin_context(uuid,uuid,text,text,text,uuid[],boolean) to authenticated;

create or replace function private.workspace_generation_begin(p_author_id uuid,p_id uuid,p_job text,p_prompt text,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.workspace_generations; created public.workspace_generations; attempts integer;
begin
  perform private.assert_studio_recording_key(p_recording_key);
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Only an owner or editor can ask Raven.' using errcode='42501';
  end if;
  if p_id is null or p_job is null or p_job not in ('brainstorm','agent-design','learning') or p_prompt is null or length(trim(p_prompt)) not between 10 and 6000 then
    raise exception 'Check the request fields.' using errcode='22023';
  end if;
  perform 1 from public.authors where id=p_author_id for update;
  select * into existing from public.workspace_generations where id=p_id;
  if found then
    if existing.author_id is distinct from p_author_id or existing.created_by is distinct from auth.uid()
      or existing.job is distinct from p_job or existing.prompt is distinct from trim(p_prompt) then
      raise exception 'This request ID has already been used.' using errcode='40001';
    end if;
    if not private.strategy_snapshot_allowed(p_author_id,existing.knowledge_context) then raise exception 'Source unavailable' using errcode='42501';end if;
    return jsonb_build_object('created',false,'generation',to_jsonb(existing));
  end if;
  update public.workspace_generations set status='failed',error_code='interrupted',completed_at=now()
    where author_id=p_author_id and status='pending' and created_at<now()-interval '2 minutes';
  if exists(select 1 from public.workspace_generations where author_id=p_author_id and status='pending') then
    raise exception 'Another question is still being considered.' using errcode='55P03';
  end if;
  select count(*) into attempts from public.workspace_generations
    where author_id=p_author_id and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if attempts>=20 then raise exception 'The workspace has reached its daily question limit.' using errcode='54000'; end if;
  insert into public.workspace_generations(id,author_id,created_by,job,prompt)
    values(p_id,p_author_id,auth.uid(),p_job,trim(p_prompt)) returning * into created;
  return jsonb_build_object('created',true,'generation',to_jsonb(created));
end;
$$;

create or replace function private.workspace_generation_finish(
  p_author_id uuid,p_id uuid,p_status text,p_result jsonb,p_error_code text,
  p_input_tokens integer,p_output_tokens integer,p_estimated_cost_usd numeric,p_gateway_generation_id text,p_recording_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.workspace_generations;
begin
  perform private.assert_studio_recording_key(p_recording_key);
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Only an owner or editor can finish this request.' using errcode='42501';
  end if;
  select * into existing from public.workspace_generations where author_id=p_author_id and id=p_id for update;
  if not found then raise exception 'Request unavailable.' using errcode='P0002'; end if;
  if existing.created_by<>auth.uid() then raise exception 'This request belongs to another member.' using errcode='42501'; end if;
  if not private.strategy_snapshot_allowed(p_author_id,existing.knowledge_context) then raise exception 'Source unavailable' using errcode='42501';end if;
  if existing.status<>'pending' then return to_jsonb(existing); end if;
  if p_status is null or p_status not in ('complete','failed') then raise exception 'Invalid final status.' using errcode='22023'; end if;
  if p_status='complete' and not private.valid_studio_output(p_result,private.studio_reference_text(existing.prompt,existing.knowledge_context)) then
    raise exception 'Invalid structured result.' using errcode='22023';
  end if;
  update public.workspace_generations set status=p_status,result=p_result,error_code=p_error_code,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,estimated_cost_usd=p_estimated_cost_usd,
    gateway_generation_id=p_gateway_generation_id,completed_at=now()
    where id=p_id returning * into existing;
  return to_jsonb(existing);
end;
$$;
create function public.catalog_observations(a uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.can_read_author(a) then raise exception 'Workspace unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
  select b.id,b.slug,b.title,b.metadata,b.series_id,b.active_manuscript_id as manuscript_id,
   (select coalesce(jsonb_agg(f.value),'[]') from (select value from jsonb_array_elements(bi.profile->'facts') where value->>'kind'='supported' and value->>'spoiler'='false' and value->>'category' in ('theme','trope','genre','tone','reader_promise') limit 32) f) as facts
  from public.books b join public.book_intelligence bi on bi.author_id=b.author_id and bi.manuscript_id=b.active_manuscript_id
  where b.author_id=a and b.data_origin<>'demo' and private.manuscript_permission_valid(a,b.active_manuscript_id) order by b.title limit 100
 ) q;
 return result;
end $$;
revoke all on function public.catalog_observations(uuid) from public,anon;
grant execute on function public.catalog_observations(uuid) to authenticated;

create or replace function private.strategy_begin_revision(a uuid,p_id uuid,p_request uuid,p_expected integer,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;r public.strategy_revisions;e jsonb;feedback text;begin
 perform private.manuscript_writer(a,p_key);
 perform 1 from public.authors where id=a for update;
 select * into r from public.strategy_revisions where id=p_request;
 if found then
  if r.author_id<>a or r.plan_id<>p_id or r.created_by<>auth.uid() or not private.strategy_snapshot_allowed(a,r.input_snapshot) then raise exception 'Request ID unavailable' using errcode='42501';end if;
  return jsonb_build_object('created',false,'revision',to_jsonb(r));
 end if;
 select * into p from public.strategy_plans where author_id=a and id=p_id for update;
 if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
 if p.version is distinct from p_expected then raise exception 'Plan changed' using errcode='40001';end if;
 if p.status not in ('draft','needs_review','changes_requested') then raise exception 'Reviewed plans cannot regenerate' using errcode='22023';end if;
 if exists(select 1 from public.strategy_revisions where author_id=a and plan_id=p_id and status='pending' and created_at>now()-interval '2 minutes') then raise exception 'A plan is already being built' using errcode='55P03';end if;
 update public.strategy_revisions set status='failed',error_code='interrupted',completed_at=now() where author_id=a and plan_id=p_id and status='pending';
 if (select count(*) from public.strategy_revisions where author_id=a and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=20 then raise exception 'Daily plan limit reached' using errcode='54000';end if;
 e:=jsonb_build_array(jsonb_build_object('id','request','kind','request','label','Your planning request','text',p.input->>'intent','book_id',null,'source_id',null,'manuscript_id',null,'chunk_id',null));
 if p.origin_snapshot is not null then e:=e||jsonb_build_array(jsonb_build_object('id','original-request','kind','member_input','label',p.origin_snapshot->>'title','text',p.origin_snapshot->>'draft','book_id',null,'source_id',null,'manuscript_id',null,'chunk_id',null));end if;
 if jsonb_array_length(p.input->'bookIds')>0 then
  e:=e||(private.book_reference_context(a,array(select value::uuid from jsonb_array_elements_text(p.input->'bookIds')),p.input->>'intent',false)->'evidence');
 end if;
 select string_agg(left(rv.feedback,1000),E'\n' order by rv.created_at) into feedback from (select sr.feedback,sr.created_at from public.strategy_reviews sr where author_id=a and plan_id=p_id order by created_at desc limit 3) rv;
 if nullif(trim(feedback),'') is not null then e:=e||jsonb_build_array(jsonb_build_object('id','review-feedback','kind','review','label','Owner review guidance','text',feedback,'book_id',null,'source_id',null,'manuscript_id',null,'chunk_id',null));end if;
 insert into public.strategy_revisions(id,author_id,plan_id,created_by,revision,plan_version,input_snapshot) values(p_request,a,p_id,auth.uid(),coalesce((select max(revision) from public.strategy_revisions where plan_id=p_id),0)+1,p.version,jsonb_build_object('input',p.input,'evidence',e,'captured_at',now())) returning * into r;
 return jsonb_build_object('created',true,'revision',to_jsonb(r));
end $$;

