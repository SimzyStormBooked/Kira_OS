-- On-demand AI thinking. No external actions or background retries.
-- The server-only recording key prevents a member's browser token from fabricating
-- AI provenance. Provision only its SHA-256 hash through an administrative connection.
create table private.workspace_generation_config (
  singleton boolean primary key default true check(singleton),
  recording_key_hash text not null check(recording_key_hash ~ '^[a-f0-9]{64}$')
);
alter table private.workspace_generation_config enable row level security;
revoke all on private.workspace_generation_config from public,anon,authenticated;
create function private.assert_studio_recording_key(recording_key text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if recording_key is null or recording_key !~ '^[A-Fa-f0-9]{64}$' or not exists(
    select 1 from private.workspace_generation_config where singleton
      and recording_key_hash=encode(sha256(convert_to(recording_key,'UTF8')),'hex')
  ) then raise exception 'The AI recording connection is not authorized.' using errcode='42501'; end if;
end;
$$;
revoke all on function private.assert_studio_recording_key(text) from public,anon,authenticated;

create function private.valid_studio_output(value jsonb, prompt text) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; part jsonb; field text;
begin
  if value is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>30000
    or (select count(*) from jsonb_object_keys(value))<>6
    or not(value ?& array['kind','title','summary','options','questions','context_used'])
    or jsonb_typeof(value->'kind') is distinct from 'string' or value->>'kind' not in ('ideas','boundary') then return false; end if;
  if jsonb_typeof(value->'title') is distinct from 'string' or length(trim(value->>'title')) not between 1 and 120
    or jsonb_typeof(value->'summary') is distinct from 'string' or length(trim(value->>'summary')) not between 1 and 1600 then return false; end if;
  foreach field in array array['options','questions','context_used'] loop
    if jsonb_typeof(value->field) is distinct from 'array' then return false; end if;
  end loop;
  if jsonb_array_length(value->'options')>3 or jsonb_array_length(value->'questions')>3 or jsonb_array_length(value->'context_used')>4
    or (value->>'kind'='ideas' and jsonb_array_length(value->'options')=0)
    or (value->>'kind'='boundary' and jsonb_array_length(value->'options')<>0) then return false; end if;
  for item in select * from jsonb_array_elements(value->'context_used') loop
    if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and 400 or strpos(prompt,item#>>'{}')=0 then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(value->'questions') loop
    if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and 300 then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(value->'options') loop
    if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>5
      or not(item ?& array['title','idea','tradeoff','first_step','verify']) then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string' or length(trim(item->>'title')) not between 1 and 120 then return false; end if;
    foreach field in array array['idea','tradeoff','first_step'] loop
      if jsonb_typeof(item->field) is distinct from 'string' or length(trim(item->>field)) not between 1 and 600 then return false; end if;
    end loop;
    if jsonb_typeof(item->'verify') is distinct from 'array' or jsonb_array_length(item->'verify')>4 then return false; end if;
    for part in select * from jsonb_array_elements(item->'verify') loop
      if jsonb_typeof(part) is distinct from 'string' or length(trim(part#>>'{}')) not between 1 and 300 then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function private.valid_studio_output(jsonb,text) from public;
create table public.workspace_generations (
  id uuid primary key,
  author_id uuid not null references public.authors(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  job text not null check(job in ('brainstorm','agent-design','learning')),
  prompt text not null check(length(trim(prompt)) between 10 and 6000),
  model text not null default 'google/gemini-3.8-flash' check(model='google/gemini-3.8-flash'),
  status text not null default 'pending' check(status in ('pending','complete','failed')),
  result jsonb,
  input_tokens integer check(input_tokens>=0), output_tokens integer check(output_tokens>=0),
  estimated_cost_usd numeric(14,8) check(estimated_cost_usd>=0),
  gateway_generation_id text check(gateway_generation_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  error_code text check(error_code in ('provider_unavailable','funding_required','timeout','invalid_output','policy_blocked','interrupted')),
  created_at timestamptz not null default now(), completed_at timestamptz,
  check((status='pending' and result is null and error_code is null and completed_at is null)
     or (status='complete' and result is not null and error_code is null and completed_at is not null)
     or (status='failed' and result is null and error_code is not null and completed_at is not null)),
  check(result is null or private.valid_studio_output(result,prompt)),
  unique(author_id,id)
);
create index workspace_generations_history on public.workspace_generations(author_id,created_at desc);
alter table public.workspace_generations enable row level security;
create policy workspace_generations_read on public.workspace_generations for select to authenticated
  using(private.can_read_author(author_id));
revoke all on public.workspace_generations from public, anon, authenticated;
grant select on public.workspace_generations to authenticated;

-- Lock the author before counting or inserting so concurrent requests cannot bypass
-- the daily limit. A reused request ID never authorizes another model invocation.
create function private.workspace_generation_begin(p_author_id uuid,p_id uuid,p_job text,p_prompt text,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.workspace_generations; created public.workspace_generations; attempts integer;
begin
  perform private.assert_studio_recording_key(p_recording_key);
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Only an owner or editor can ask Raven.' using errcode='42501';
  end if;
  perform 1 from public.authors where id=p_author_id for update;
  select * into existing from public.workspace_generations where id=p_id;
  if found then
    if existing.author_id<>p_author_id or existing.created_by<>auth.uid() or existing.job<>p_job or existing.prompt<>trim(p_prompt) then
      raise exception 'This request ID has already been used.' using errcode='40001';
    end if;
    return jsonb_build_object('created',false,'generation',to_jsonb(existing));
  end if;
  if p_id is null or p_job is null or p_job not in ('brainstorm','agent-design','learning') or p_prompt is null or length(trim(p_prompt)) not between 10 and 6000 then
    raise exception 'Check the request fields.' using errcode='22023';
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

create function private.workspace_generation_finish(
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
  if existing.status<>'pending' then return to_jsonb(existing); end if;
  if p_status is null or p_status not in ('complete','failed') then raise exception 'Invalid final status.' using errcode='22023'; end if;
  if p_status='complete' and not private.valid_studio_output(p_result,existing.prompt) then
    raise exception 'Invalid structured result.' using errcode='22023';
  end if;
  update public.workspace_generations set status=p_status,result=p_result,error_code=p_error_code,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,estimated_cost_usd=p_estimated_cost_usd,
    gateway_generation_id=p_gateway_generation_id,completed_at=now()
    where id=p_id returning * into existing;
  return to_jsonb(existing);
end;
$$;
create function public.workspace_generation_begin(p_author_id uuid,p_id uuid,p_job text,p_prompt text,p_recording_key text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.workspace_generation_begin(p_author_id,p_id,p_job,p_prompt,p_recording_key);
$$;
create function public.workspace_generation_finish(
  p_author_id uuid,p_id uuid,p_status text,p_result jsonb,p_error_code text,
  p_input_tokens integer,p_output_tokens integer,p_estimated_cost_usd numeric,p_gateway_generation_id text,p_recording_key text
) returns jsonb language sql security invoker set search_path='' as $$
  select private.workspace_generation_finish(p_author_id,p_id,p_status,p_result,p_error_code,p_input_tokens,p_output_tokens,p_estimated_cost_usd,p_gateway_generation_id,p_recording_key);
$$;
revoke all on function private.workspace_generation_begin(uuid,uuid,text,text,text),public.workspace_generation_begin(uuid,uuid,text,text,text) from public,anon;
revoke all on function private.workspace_generation_finish(uuid,uuid,text,jsonb,text,integer,integer,numeric,text,text),public.workspace_generation_finish(uuid,uuid,text,jsonb,text,integer,integer,numeric,text,text) from public,anon;
grant execute on function private.workspace_generation_begin(uuid,uuid,text,text,text),public.workspace_generation_begin(uuid,uuid,text,text,text) to authenticated;
grant execute on function private.workspace_generation_finish(uuid,uuid,text,jsonb,text,integer,integer,numeric,text,text),public.workspace_generation_finish(uuid,uuid,text,jsonb,text,integer,integer,numeric,text,text) to authenticated;
comment on table public.workspace_generations is 'Private on-demand AI requests and validated results. Costs are list-price estimates. Failed attempts count toward the shared daily limit. No external actions run.';
