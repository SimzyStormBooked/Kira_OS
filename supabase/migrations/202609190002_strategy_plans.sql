-- Private business plans. Review and activation create internal tasks, never external actions.
create table public.strategy_plans (
 id uuid primary key, author_id uuid not null references public.authors(id), created_by uuid not null references auth.users(id),
 title text not null, input jsonb not null, origin_approval_id uuid, origin_snapshot jsonb,
 status text not null default 'draft' check(status in ('draft','needs_review','changes_requested','approved','active','completed')),
 version integer not null default 0, latest_revision_id uuid, approved_revision_id uuid, active_revision_id uuid, campaign_id uuid,
 auto_approve boolean not null default false check(not auto_approve), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(author_id,id), foreign key(author_id,origin_approval_id) references public.approval_requests(author_id,id),
 foreign key(author_id,campaign_id) references public.campaigns(author_id,id)
);
create table public.strategy_revisions (
 id uuid primary key,author_id uuid not null,plan_id uuid not null,created_by uuid not null references auth.users(id),revision integer not null,plan_version integer not null,
 status text not null default 'pending' check(status in ('pending','complete','failed')),input_snapshot jsonb not null,output jsonb,
 model text not null default 'google/gemini-3.8-flash',usage jsonb,error_code text,created_at timestamptz not null default now(),completed_at timestamptz,
 unique(author_id,id),unique(author_id,plan_id,id),unique(author_id,plan_id,revision),foreign key(author_id,plan_id) references public.strategy_plans(author_id,id),
 check((status='pending' and output is null and completed_at is null) or (status='complete' and output is not null and error_code is null and completed_at is not null) or (status='failed' and output is null and error_code is not null and completed_at is not null))
);
create unique index strategy_pending on public.strategy_revisions(author_id,plan_id) where status='pending';
alter table public.strategy_plans add foreign key(author_id,id,latest_revision_id) references public.strategy_revisions(author_id,plan_id,id);
alter table public.strategy_plans add foreign key(author_id,id,approved_revision_id) references public.strategy_revisions(author_id,plan_id,id);
alter table public.strategy_plans add foreign key(author_id,id,active_revision_id) references public.strategy_revisions(author_id,plan_id,id);
create table public.strategy_reviews (
 id uuid primary key default gen_random_uuid(),author_id uuid not null,plan_id uuid not null,revision_id uuid not null,
 decision text not null check(decision in ('approved','changes_requested')),feedback text not null,reviewed_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(author_id,plan_id,revision_id) references public.strategy_revisions(author_id,plan_id,id)
);
create table public.strategy_tasks (
 id uuid primary key default gen_random_uuid(),author_id uuid not null,plan_id uuid not null,revision_id uuid not null,campaign_id uuid not null,
 phase integer not null check(phase in (30,60,90)),ordinal integer not null,due_date date not null,definition jsonb not null,
 status text not null default 'todo' check(status in ('todo','done','skipped')),version integer not null default 0,completed_by uuid references auth.users(id),completed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(author_id,id),unique(revision_id,ordinal),
 foreign key(author_id,plan_id,revision_id) references public.strategy_revisions(author_id,plan_id,id),foreign key(author_id,campaign_id) references public.campaigns(author_id,id)
);
create table public.strategy_results (
 id uuid primary key,author_id uuid not null,plan_id uuid not null,revision_id uuid not null,goal_id uuid not null,
 value numeric not null check(value>=0 and value<=1e12),measured_at date not null,note text not null check(length(trim(note)) between 1 and 1000),
 recorded_by uuid not null references auth.users(id),source_type text not null default 'manual_snapshot' check(source_type='manual_snapshot'),created_at timestamptz not null default now(),
 foreign key(author_id,plan_id,revision_id) references public.strategy_revisions(author_id,plan_id,id)
);

create function private.strategy_snapshot_allowed(a uuid,snapshot jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_author(a) and not exists(select 1 from jsonb_array_elements(snapshot->'evidence') e where e->>'manuscript_id' is not null and not private.manuscript_permission_valid(a,(e->>'manuscript_id')::uuid));
$$;
revoke all on function private.strategy_snapshot_allowed(uuid,jsonb) from public,anon;
grant execute on function private.strategy_snapshot_allowed(uuid,jsonb) to authenticated;
do $$ declare t text;begin
 foreach t in array array['strategy_plans','strategy_revisions','strategy_reviews','strategy_tasks','strategy_results'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create index %I on public.%I(author_id)',t||'_author_idx',t);
 end loop;
end $$;
create policy strategy_read on public.strategy_plans for select to authenticated using(private.can_read_author(author_id));
create policy strategy_read on public.strategy_revisions for select to authenticated using(private.strategy_snapshot_allowed(author_id,input_snapshot));
create policy strategy_read on public.strategy_reviews for select to authenticated using(exists(select 1 from public.strategy_revisions r where r.id=revision_id and r.author_id=strategy_reviews.author_id));
create policy strategy_read on public.strategy_tasks for select to authenticated using(exists(select 1 from public.strategy_revisions r where r.id=revision_id and r.author_id=strategy_tasks.author_id));
create policy strategy_read on public.strategy_results for select to authenticated using(exists(select 1 from public.strategy_revisions r where r.id=revision_id and r.author_id=strategy_results.author_id));

create function private.strategy_check_input(a uuid,v jsonb) returns void language plpgsql security definer set search_path='' as $$
declare x jsonb;k text;begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or octet_length(v::text)>20000 or not(v ?& array['title','intent','bookIds','seriesId','originApprovalId','mode','anchorDate','budgetUsd','weeklyHours','segments','goals']) or (select count(*) from jsonb_object_keys(v))<>11 then raise exception 'Invalid plan fields' using errcode='22023';end if;
 if jsonb_typeof(v->'title') is distinct from 'string' or length(trim(v->>'title')) not between 1 and 160 or jsonb_typeof(v->'intent') is distinct from 'string' or length(trim(v->>'intent')) not between 1 and 6000 or v->>'mode' is null or v->>'mode' not in ('before_release','after_release','evergreen') then raise exception 'Invalid plan text' using errcode='22023';end if;
 if jsonb_typeof(v->'bookIds') is distinct from 'array' or jsonb_array_length(v->'bookIds')>4 or jsonb_typeof(v->'segments') is distinct from 'array' or jsonb_array_length(v->'segments') not between 1 and 7 or jsonb_typeof(v->'goals') is distinct from 'array' or jsonb_array_length(v->'goals')>8 then raise exception 'Invalid plan lists' using errcode='22023';end if;
 if (select count(*)<>count(distinct value) from jsonb_array_elements(v->'bookIds')) or (select count(*)<>count(distinct value) from jsonb_array_elements(v->'segments')) or (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(v->'goals')) then raise exception 'Duplicate plan list item' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(v->'bookIds') loop
  if not exists(select 1 from public.books where author_id=a and id=(x#>>'{}')::uuid and data_origin<>'demo') then raise exception 'Book unavailable' using errcode='42501';end if;
 end loop;
 if v->>'seriesId' is not null and not exists(select 1 from public.series where author_id=a and id=(v->>'seriesId')::uuid and data_origin<>'demo') then raise exception 'Series unavailable' using errcode='42501';end if;
 if v->>'originApprovalId' is not null and not exists(select 1 from public.approval_requests where author_id=a and id=(v->>'originApprovalId')::uuid and data_origin<>'demo') then raise exception 'Request unavailable' using errcode='42501';end if;
 if v->>'anchorDate' is not null and ((v->>'anchorDate')!~'^\d{4}-\d{2}-\d{2}$' or (v->>'anchorDate')::date not between date '2000-01-01' and date '2200-01-01') then raise exception 'Invalid date' using errcode='22023';end if;
 foreach k in array array['budgetUsd','weeklyHours'] loop
  if v->>k is not null and (jsonb_typeof(v->k) is distinct from 'number' or (v->>k)::numeric<0 or (v->>k)::numeric>case when k='weeklyHours' then 168 else 10000000 end) then raise exception 'Invalid plan resources' using errcode='22023';end if;
 end loop;
 for x in select value from jsonb_array_elements(v->'segments') loop
  if jsonb_typeof(x) is distinct from 'string' or x#>>'{}' not in ('new_readers','existing_fans','ebook','print','audiobook','newsletter','book_clubs') then raise exception 'Invalid audience' using errcode='22023';end if;
 end loop;
 for x in select value from jsonb_array_elements(v->'goals') loop
  if jsonb_typeof(x) is distinct from 'object' or (select count(*) from jsonb_object_keys(x))<>7 or not(x ?& array['id','label','metric','unit','target','baseline','dueDate']) then raise exception 'Invalid goal fields' using errcode='22023';end if;
  if jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'label') is distinct from 'string' or x->>'metric' is null or x->>'unit' is null then raise exception 'Invalid goal types' using errcode='22023';end if;
  perform (x->>'id')::uuid;
  if length(trim(x->>'label')) not between 1 and 120 or x->>'metric' not in ('preorders','sales','reviews','subscribers','readers','revenue','custom') or x->>'unit' not in ('count','currency','percent') or jsonb_typeof(x->'target') is distinct from 'number' or (x->>'target')::numeric not between 0 and 1e12 or (x->>'baseline' is not null and (jsonb_typeof(x->'baseline') is distinct from 'number' or (x->>'baseline')::numeric not between 0 and 1e12)) then raise exception 'Invalid goal' using errcode='22023';end if;
  if x->>'dueDate' is not null then perform (x->>'dueDate')::date;end if;
 end loop;
end $$;

create function private.strategy_save_plan(a uuid,p_id uuid,p_expected integer,p_input jsonb) returns public.strategy_plans language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;origin jsonb;begin
 if not private.can_edit_author(a) then raise exception 'Only editors can save plans' using errcode='42501';end if;
 perform private.strategy_check_input(a,p_input);
 select * into p from public.strategy_plans where id=p_id for update;
 if found then
  if p.author_id<>a then raise exception 'Plan unavailable' using errcode='42501';end if;
  if p.version is distinct from p_expected then raise exception 'Plan changed' using errcode='40001';end if;
  if p.status in ('approved','active','completed') or exists(select 1 from public.strategy_revisions where plan_id=p_id and status='pending' and created_at>now()-interval '2 minutes') then raise exception 'Reviewed or running plans cannot be edited' using errcode='55P03';end if;
  if p.origin_approval_id is distinct from (p_input->>'originApprovalId')::uuid then raise exception 'Request provenance is immutable' using errcode='22023';end if;
  update public.strategy_plans set title=p_input->>'title',input=p_input,status='draft',version=version+1,updated_at=now(),approved_revision_id=null where id=p_id returning * into p;
 else
  if p_expected is not null then raise exception 'Plan unavailable' using errcode='P0002';end if;
  if p_input->>'originApprovalId' is not null then select jsonb_build_object('id',id,'title',title,'draft',draft,'version',version,'evidence',evidence) into origin from public.approval_requests where id=(p_input->>'originApprovalId')::uuid and author_id=a;end if;
  insert into public.strategy_plans(id,author_id,created_by,title,input,origin_approval_id,origin_snapshot) values(p_id,a,auth.uid(),p_input->>'title',p_input,(p_input->>'originApprovalId')::uuid,origin) returning * into p;
 end if;return p;
end $$;

create function private.strategy_begin_revision(a uuid,p_id uuid,p_request uuid,p_expected integer,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;r public.strategy_revisions;e jsonb; b record;c record;feedback text;begin
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
 for b in select * from public.books where author_id=a and id in(select value::text::uuid from jsonb_array_elements_text(p.input->'bookIds')) order by id loop
  e:=e||jsonb_build_array(jsonb_build_object('id','book-'||b.id,'kind','book_metadata','label',b.title,'text',left(concat_ws(E'\n',b.title,b.overview,'Author-provided metadata: '||b.metadata::text),6000),'book_id',b.id,'source_id',null,'manuscript_id',null,'chunk_id',null));
  if b.active_manuscript_id is not null and private.manuscript_permission_valid(a,b.active_manuscript_id) then
   for c in select k.id,k.section,k.source_id,string_agg(distinct cit->>'quote', E'\n') as reference_text
    from public.knowledge_chunks k join public.book_intelligence bi on bi.author_id=k.author_id and bi.manuscript_id=k.manuscript_id
    cross join lateral jsonb_array_elements(bi.profile->'facts') f cross join lateral jsonb_array_elements(f->'citations') cit
    where k.author_id=a and k.manuscript_id=b.active_manuscript_id and f->>'spoiler'='false' and f->>'kind'='supported' and cit->>'chunk_id'=k.id::text
    group by k.id,k.section,k.source_id,k.chunk_index order by k.chunk_index limit 4 loop
    e:=e||jsonb_build_array(jsonb_build_object('id',c.id::text,'kind','manuscript','label',b.title||' · '||c.section,'text',left(c.reference_text,2000),'book_id',b.id,'source_id',c.source_id,'manuscript_id',b.active_manuscript_id,'chunk_id',c.id));
   end loop;
  end if;
 end loop;
 select string_agg(left(rv.feedback,1000),E'\n' order by rv.created_at) into feedback from (select sr.feedback,sr.created_at from public.strategy_reviews sr where author_id=a and plan_id=p_id order by created_at desc limit 3) rv;
 if nullif(trim(feedback),'') is not null then e:=e||jsonb_build_array(jsonb_build_object('id','review-feedback','kind','review','label','Owner review guidance','text',feedback,'book_id',null,'source_id',null,'manuscript_id',null,'chunk_id',null));end if;
 insert into public.strategy_revisions(id,author_id,plan_id,created_by,revision,plan_version,input_snapshot) values(p_request,a,p_id,auth.uid(),coalesce((select max(revision) from public.strategy_revisions where plan_id=p_id),0)+1,p.version,jsonb_build_object('input',p.input,'evidence',e,'captured_at',now())) returning * into r;
 return jsonb_build_object('created',true,'revision',to_jsonb(r));
end $$;

create function private.strategy_valid_output(v jsonb,s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;cit jsonb;phase jsonb;task jsonb;g jsonb;off integer;k text;cap integer;begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or octet_length(v::text)>64000 or not(v ?& array['title','summary','positioning','audiences','recommendations','phases','risks','questions']) or (select count(*) from jsonb_object_keys(v))<>8 then return false;end if;
 if v->>'title' is null or v->>'summary' is null or v->>'positioning' is null or length(trim(v->>'title')) not between 1 and 160 or length(trim(v->>'summary')) not between 1 and 1600 or length(trim(v->>'positioning')) not between 1 and 1000 then return false;end if;
 if jsonb_typeof(v->'audiences') is distinct from 'array' or jsonb_array_length(v->'audiences') not between 1 and 7 or jsonb_typeof(v->'recommendations') is distinct from 'array' or jsonb_array_length(v->'recommendations') not between 1 and 8 or jsonb_typeof(v->'phases') is distinct from 'array' or jsonb_array_length(v->'phases')<>3 or (select count(distinct value->>'window') from jsonb_array_elements(v->'phases'))<>3 then return false;end if;
 foreach k in array array['risks','questions'] loop
  if jsonb_typeof(v->k) is distinct from 'array' or jsonb_array_length(v->k)>(case when k='risks' then 8 else 6 end) then return false;end if;
  for item in select value from jsonb_array_elements(v->k) loop if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and (case when k='risks' then 500 else 300 end) then return false;end if;end loop;
 end loop;
 for item in select value from jsonb_array_elements(v->'recommendations') loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>8 or not(item ?& array['title','action','rationale','channel','effort','estimated_cost_usd','goal_ids','citations']) then return false;end if;
  foreach k in array array['title','action','rationale','channel','effort'] loop
   cap:=case when k='title' then 160 when k='channel' then 80 when k='effort' then 10 else 800 end;
   if jsonb_typeof(item->k) is distinct from 'string' or length(trim(item->>k)) not between 1 and cap then return false;end if;
  end loop;
  if item->>'effort' not in ('low','medium','high') or jsonb_typeof(item->'estimated_cost_usd') is distinct from 'number' or (item->>'estimated_cost_usd')::numeric not between 0 and 1e7 then return false;end if;
 end loop;
 for item in select value from jsonb_array_elements(v->'audiences') loop
  if (select count(*) from jsonb_object_keys(item))<>3 or jsonb_typeof(item->'why') is distinct from 'string' or length(trim(item->>'why')) not between 1 and 600 then return false;end if;
  if item->>'segment' is null or not (s->'input'->'segments' ? (item->>'segment')) then return false;end if;
 end loop;
 for phase in select value from jsonb_array_elements(v->'phases') loop
  if (select count(*) from jsonb_object_keys(phase))<>4 or jsonb_typeof(phase->'label') is distinct from 'string' or length(trim(phase->>'label')) not between 1 and 120 or jsonb_typeof(phase->'focus') is distinct from 'string' or length(trim(phase->>'focus')) not between 1 and 600 then return false;end if;
  if phase->>'window' is null or (phase->>'window')::integer not in (30,60,90) or jsonb_typeof(phase->'tasks') is distinct from 'array' or jsonb_array_length(phase->'tasks') not between 1 and 6 then return false;end if;
  for task in select value from jsonb_array_elements(phase->'tasks') loop
   if (select count(*) from jsonb_object_keys(task))<>7 or not(task ?& array['title','instructions','channel','day_offset','goal_ids','success_measure','citations']) then return false;end if;
   foreach k in array array['title','instructions','channel','success_measure'] loop
    cap:=case when k='title' then 160 when k='instructions' then 1000 when k='channel' then 80 else 400 end;
    if jsonb_typeof(task->k) is distinct from 'string' or length(trim(task->>k)) not between 1 and cap then return false;end if;
   end loop;
   if jsonb_typeof(task->'day_offset') is distinct from 'number' or (task->>'day_offset')::numeric<>trunc((task->>'day_offset')::numeric) or length(trim(task->>'title')) not between 1 and 160 or length(trim(task->>'instructions')) not between 1 and 1000 then return false;end if;
   off:=(task->>'day_offset')::integer*case when s->'input'->>'mode'='before_release' then -1 else 1 end;
   if off not between (phase->>'window')::integer-29 and (phase->>'window')::integer then return false;end if;
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(v->'audiences') union all select value from jsonb_array_elements(v->'recommendations') union all select t.value from jsonb_array_elements(v->'phases') p cross join lateral jsonb_array_elements(p.value->'tasks') t loop
  if jsonb_typeof(item->'citations') is distinct from 'array' or jsonb_array_length(item->'citations') not between 1 and 4 then return false;end if;
  for cit in select value from jsonb_array_elements(item->'citations') loop
   if (select count(*) from jsonb_object_keys(cit))<>2 or jsonb_typeof(cit->'quote') is distinct from 'string' or jsonb_typeof(cit->'evidence_id') is distinct from 'string' then return false;end if;
   if cit->>'quote' is null or length(cit->>'quote') not between 1 and 300 or not exists(select 1 from jsonb_array_elements(s->'evidence') e where e->>'id'=cit->>'evidence_id' and position(cit->>'quote' in e->>'text')>0) then return false;end if;
  end loop;
  if item ? 'goal_ids' then
   if jsonb_typeof(item->'goal_ids') is distinct from 'array' or jsonb_array_length(item->'goal_ids')>8 then return false;end if;
   for g in select value from jsonb_array_elements(item->'goal_ids') loop if not exists(select 1 from jsonb_array_elements(s->'input'->'goals') goal where goal->>'id'=g#>>'{}') then return false;end if;end loop;
  end if;
 end loop;return true;
exception when others then return false;
end $$;

create function private.strategy_finish_revision(a uuid,p_request uuid,p_output jsonb,p_error text,p_usage jsonb,p_key text) returns public.strategy_revisions language plpgsql security definer set search_path='' as $$
declare r public.strategy_revisions;p public.strategy_plans;k text;begin
 perform private.manuscript_writer(a,p_key);
 select * into r from public.strategy_revisions where id=p_request and author_id=a for update;
 if not found or r.created_by<>auth.uid() then raise exception 'Revision unavailable' using errcode='42501';end if;
 if not private.strategy_snapshot_allowed(a,r.input_snapshot) then raise exception 'Source permission changed' using errcode='42501';end if;
 if r.status<>'pending' then return r;end if;
 select * into p from public.strategy_plans where id=r.plan_id and author_id=a for update;
 if p.version<>r.plan_version then raise exception 'Plan changed during generation' using errcode='40001';end if;
 if p_error is null and not private.strategy_valid_output(p_output,r.input_snapshot) then raise exception 'Invalid plan output' using errcode='22023';end if;
 if p_error is not null and (p_output is not null or p_error not in ('provider_unavailable','funding_required','timeout','invalid_output','policy_blocked','interrupted')) then raise exception 'Invalid failure code' using errcode='22023';end if;
 if p_usage is null or jsonb_typeof(p_usage) is distinct from 'object' or not(p_usage ?& array['inputTokens','outputTokens','estimatedCostUsd','gatewayGenerationId']) then raise exception 'Invalid usage' using errcode='22023';end if;
 foreach k in array array['inputTokens','outputTokens','estimatedCostUsd'] loop
  if p_usage->>k is not null and (jsonb_typeof(p_usage->k) is distinct from 'number' or (p_usage->>k)::numeric<0) then raise exception 'Invalid usage' using errcode='22023';end if;
 end loop;
 update public.strategy_revisions set status=case when p_error is null then 'complete' else 'failed' end,output=p_output,error_code=p_error,usage=p_usage,completed_at=now() where id=r.id returning * into r;
 if p_error is null then update public.strategy_plans set latest_revision_id=r.id,approved_revision_id=null,status='needs_review',version=version+1,updated_at=now() where id=p.id;end if;
 return r;
end $$;

create function private.strategy_review_plan(a uuid,p_id uuid,p_expected integer,p_decision text,p_feedback text) returns public.strategy_plans language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;r public.strategy_revisions;begin
 if not private.owns_author(a) then raise exception 'Only the workspace owner can review marketing plans' using errcode='42501';end if;
 select * into p from public.strategy_plans where author_id=a and id=p_id for update;
 if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
 if p.version is distinct from p_expected then raise exception 'Plan changed' using errcode='40001';end if;
 if p.status not in ('needs_review','approved') or p_decision is null or p_decision not in ('approved','changes_requested') or p_feedback is null or length(p_feedback)>4000 or (p_decision='changes_requested' and length(trim(p_feedback))=0) then raise exception 'Invalid review' using errcode='22023';end if;
 if p_decision='approved' and p.input->>'anchorDate' is null then raise exception 'Set a start or release date before approval' using errcode='22023';end if;
 select * into r from public.strategy_revisions where id=p.latest_revision_id and author_id=a;
 if r.id is null or r.status<>'complete' or not private.strategy_snapshot_allowed(a,r.input_snapshot) then raise exception 'Plan evidence unavailable' using errcode='42501';end if;
 insert into public.strategy_reviews(author_id,plan_id,revision_id,decision,feedback,reviewed_by) values(a,p.id,r.id,p_decision,p_feedback,auth.uid());
 update public.strategy_plans set status=p_decision,approved_revision_id=case when p_decision='approved' then r.id else null end,version=version+1,updated_at=now() where id=p.id returning * into p;return p;
end $$;

create function private.strategy_activate_plan(a uuid,p_id uuid,p_expected integer) returns public.strategy_plans language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;r public.strategy_revisions;phase jsonb;task jsonb;ordinal integer:=0;campaign uuid;anchor date;begin
 if not private.owns_author(a) then raise exception 'Only the owner can activate a reviewed plan' using errcode='42501';end if;
 select * into p from public.strategy_plans where author_id=a and id=p_id for update;
 if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
 if p.status in ('active','completed') and p.active_revision_id=p.approved_revision_id then return p;end if;
 if p.version is distinct from p_expected then raise exception 'Plan changed' using errcode='40001';end if;
 if p.status<>'approved' or p.approved_revision_id is distinct from p.latest_revision_id or p.input->>'anchorDate' is null then raise exception 'Approve a plan with an anchor date first' using errcode='22023';end if;
 select * into r from public.strategy_revisions where id=p.approved_revision_id and author_id=a;
 if r.id is null or r.status<>'complete' or not private.strategy_snapshot_allowed(a,r.input_snapshot) then raise exception 'Plan evidence unavailable' using errcode='42501';end if;
 anchor:=(p.input->>'anchorDate')::date;
 insert into public.campaigns(author_id,name,objective,status,data_origin) values(a,p.title,p.input->>'intent','reviewed','manual') returning id into campaign;
 for phase in select value from jsonb_array_elements(r.output->'phases') loop
  for task in select value from jsonb_array_elements(phase->'tasks') loop
   ordinal:=ordinal+1;insert into public.strategy_tasks(author_id,plan_id,revision_id,campaign_id,phase,ordinal,due_date,definition) values(a,p.id,r.id,campaign,(phase->>'window')::integer,ordinal,anchor+(task->>'day_offset')::integer,task);
  end loop;
 end loop;
 update public.strategy_plans set status='active',active_revision_id=r.id,campaign_id=campaign,version=version+1,updated_at=now() where id=p.id returning * into p;return p;
end $$;

create function private.strategy_set_task(a uuid,p_id uuid,p_expected integer,p_status text) returns public.strategy_tasks language plpgsql security definer set search_path='' as $$
declare t public.strategy_tasks;r public.strategy_revisions;begin
 if not private.can_edit_author(a) then raise exception 'Only editors can update tasks' using errcode='42501';end if;
 select * into t from public.strategy_tasks where author_id=a and id=p_id for update;
 if not found then raise exception 'Task unavailable' using errcode='P0002';end if;
 if t.version is distinct from p_expected then raise exception 'Task changed' using errcode='40001';end if;
 if p_status is null or p_status not in ('todo','done','skipped') then raise exception 'Invalid task status' using errcode='22023';end if;
 select * into r from public.strategy_revisions where author_id=a and id=t.revision_id;
 if not private.strategy_snapshot_allowed(a,r.input_snapshot) then raise exception 'Source permission changed' using errcode='42501';end if;
 perform 1 from public.strategy_plans where id=t.plan_id for update;
 update public.strategy_tasks set status=p_status,version=version+1,completed_by=case when p_status='todo' then null else auth.uid() end,completed_at=case when p_status='todo' then null else now() end,updated_at=now() where id=t.id returning * into t;
 update public.strategy_plans set status=case when exists(select 1 from public.strategy_tasks where plan_id=t.plan_id and status='todo') then 'active' else 'completed' end,updated_at=now() where id=t.plan_id;return t;
end $$;

create function private.strategy_record_result(a uuid,p_plan uuid,p_value jsonb) returns public.strategy_results language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;r public.strategy_results;s jsonb;begin
 if not private.can_edit_author(a) then raise exception 'Only editors can record results' using errcode='42501';end if;
 select * into p from public.strategy_plans where author_id=a and id=p_plan for update;
 if not found or p.status not in ('active','completed') then raise exception 'Activate the plan first' using errcode='22023';end if;
 select input_snapshot into s from public.strategy_revisions where author_id=a and id=p.active_revision_id;
 if not private.strategy_snapshot_allowed(a,s) then raise exception 'Source permission changed' using errcode='42501';end if;
 if p_value is null or jsonb_typeof(p_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_value))<>5 or not(p_value ?& array['id','goalId','value','measuredAt','note']) or not exists(select 1 from jsonb_array_elements(s->'input'->'goals') g where g->>'id'=p_value->>'goalId') then raise exception 'Invalid goal result' using errcode='22023';end if;
 if jsonb_typeof(p_value->'value') is distinct from 'number' or (p_value->>'value')::numeric not between 0 and 1e12 or length(trim(p_value->>'note')) not between 1 and 1000 or (p_value->>'measuredAt')::date>current_date then raise exception 'Invalid result measurement' using errcode='22023';end if;
 select * into r from public.strategy_results where id=(p_value->>'id')::uuid;
 if found then
  if r.author_id<>a or r.plan_id<>p_plan or r.recorded_by<>auth.uid() or r.goal_id<>(p_value->>'goalId')::uuid or r.value<>(p_value->>'value')::numeric or r.measured_at<>(p_value->>'measuredAt')::date or r.note<>p_value->>'note' then raise exception 'Result ID already used' using errcode='40001';end if;return r;
 end if;
 insert into public.strategy_results(id,author_id,plan_id,revision_id,goal_id,value,measured_at,note,recorded_by) values((p_value->>'id')::uuid,a,p.id,p.active_revision_id,(p_value->>'goalId')::uuid,(p_value->>'value')::numeric,(p_value->>'measuredAt')::date,p_value->>'note',auth.uid()) returning * into r;return r;
end $$;

create function public.strategy_save_plan(a uuid,p_id uuid,p_expected integer,p_input jsonb) returns public.strategy_plans language sql security invoker set search_path='' as $$select private.strategy_save_plan(a,p_id,p_expected,p_input);$$;
create function public.strategy_begin_revision(a uuid,p_id uuid,p_request uuid,p_expected integer,p_key text) returns jsonb language sql security invoker set search_path='' as $$select private.strategy_begin_revision(a,p_id,p_request,p_expected,p_key);$$;
create function public.strategy_finish_revision(a uuid,p_request uuid,p_output jsonb,p_error text,p_usage jsonb,p_key text) returns public.strategy_revisions language sql security invoker set search_path='' as $$select private.strategy_finish_revision(a,p_request,p_output,p_error,p_usage,p_key);$$;
create function public.strategy_review_plan(a uuid,p_id uuid,p_expected integer,p_decision text,p_feedback text) returns public.strategy_plans language sql security invoker set search_path='' as $$select private.strategy_review_plan(a,p_id,p_expected,p_decision,p_feedback);$$;
create function public.strategy_activate_plan(a uuid,p_id uuid,p_expected integer) returns public.strategy_plans language sql security invoker set search_path='' as $$select private.strategy_activate_plan(a,p_id,p_expected);$$;
create function public.strategy_set_task(a uuid,p_id uuid,p_expected integer,p_status text) returns public.strategy_tasks language sql security invoker set search_path='' as $$select private.strategy_set_task(a,p_id,p_expected,p_status);$$;
create function public.strategy_record_result(a uuid,p_plan uuid,p_value jsonb) returns public.strategy_results language sql security invoker set search_path='' as $$select private.strategy_record_result(a,p_plan,p_value);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'strategy_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('strategy_save_plan','strategy_begin_revision','strategy_finish_revision','strategy_review_plan','strategy_activate_plan','strategy_set_task','strategy_record_result','strategy_snapshot_allowed') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $$;
