-- Private, versioned manuscript reference knowledge. No publishing or fiction generation.
-- Uploaded permission covers private analysis, not permission to republish passages.
alter table public.books add column metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object');
alter table public.books add column active_manuscript_id uuid;
create table public.manuscripts (
  id uuid primary key,
  author_id uuid not null references public.authors(id) on delete restrict,
  book_id uuid not null, source_id uuid not null, asset_id uuid not null,
  filename text not null check(length(filename) between 1 and 255),
  mime_type text not null check(mime_type in ('text/plain','text/markdown','application/pdf','application/epub+zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint not null check(size_bytes between 1 and 4194304),
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  version integer not null check(version>0), storage_path text not null unique,
  permission_granted_by uuid not null references auth.users(id) on delete restrict,
  permission_granted_at timestamptz not null default now(),
  permission_scope text not null default 'private_reference_analysis' check(permission_scope='private_reference_analysis'),
  status text not null default 'uploading' check(status in ('uploading','queued','processing','ready','failed')),
  error_code text check(error_code in ('storage_error','provider_unavailable','funding_required','timeout','invalid_output','policy_blocked','interrupted','embedding_unavailable')),
  chunk_count integer not null default 0 check(chunk_count between 0 and 500),
  completed_chunks integer not null default 0 check(completed_chunks>=0 and completed_chunks<=chunk_count),
  parser_version text not null default 'kira-text-v1' check(length(parser_version) between 1 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(author_id,id), unique(author_id,book_id,id), unique(author_id,id,source_id,asset_id),
  unique(author_id,book_id,version), unique(author_id,book_id,content_hash),
  unique(author_id,source_id), unique(author_id,asset_id),
  foreign key(author_id,book_id) references public.books(author_id,id),
  foreign key(author_id,source_id) references public.sources(author_id,id),
  foreign key(author_id,asset_id) references public.content_assets(author_id,id)
);
alter table public.books add foreign key(author_id,id,active_manuscript_id) references public.manuscripts(author_id,book_id,id);
alter table public.knowledge_chunks add column manuscript_id uuid;
alter table public.knowledge_chunks add column section text;
alter table public.knowledge_chunks add constraint chunks_author_id_unique unique(author_id,id);
alter table public.knowledge_chunks add foreign key(author_id,manuscript_id,source_id,asset_id) references public.manuscripts(author_id,id,source_id,asset_id);
create index manuscript_chunks_order on public.knowledge_chunks(author_id,manuscript_id,chunk_index);
create index manuscript_chunks_fts on public.knowledge_chunks using gin(to_tsvector('english',reference_text));

create table public.manuscript_batches (
  id uuid primary key, author_id uuid not null references public.authors(id) on delete restrict,
  manuscript_id uuid not null, created_by uuid not null references auth.users(id) on delete restrict,
  chunk_ids uuid[] not null check(cardinality(chunk_ids) between 1 and 4),
  status text not null default 'pending' check(status in ('pending','complete','failed')),
  model text not null default 'google/gemini-3.8-flash' check(model='google/gemini-3.8-flash'),
  result jsonb, error_code text check(error_code in ('provider_unavailable','funding_required','timeout','invalid_output','policy_blocked','interrupted','embedding_unavailable')),
  input_tokens integer check(input_tokens>=0), output_tokens integer check(output_tokens>=0), embedding_tokens integer check(embedding_tokens>=0),
  estimated_cost_usd numeric(16,8) check(estimated_cost_usd>=0), gateway_generation_id text, embedding_generation_id text,
  embedding_status text not null default 'not_started' check(embedding_status in ('not_started','complete','unavailable')),
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique(author_id,id), foreign key(author_id,manuscript_id) references public.manuscripts(author_id,id),
  check((status='pending' and result is null and error_code is null and completed_at is null)
    or (status='complete' and result is not null and error_code is null and completed_at is not null)
    or (status='failed' and result is null and error_code is not null and completed_at is not null))
);
create index manuscript_batches_progress on public.manuscript_batches(author_id,manuscript_id,created_at);
create unique index manuscript_one_pending on public.manuscript_batches(author_id,manuscript_id) where status='pending';
create table public.book_intelligence (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete restrict,
  book_id uuid not null, manuscript_id uuid not null, profile jsonb not null,
  model text not null default 'google/gemini-3.8-flash', extraction_version text not null default 'book-intelligence-v1',
  review_status text not null default 'unreviewed' check(review_status='unreviewed'),
  extracted_at timestamptz not null default now(), unique(author_id,id), unique(author_id,manuscript_id),
  foreign key(author_id,book_id,manuscript_id) references public.manuscripts(author_id,book_id,id),
  check(jsonb_typeof(profile)='object' and jsonb_typeof(profile->'facts')='array' and jsonb_typeof(profile->'characters')='array')
);
create table public.book_characters (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete restrict,
  book_id uuid not null, manuscript_id uuid not null, intelligence_id uuid not null, character_id uuid not null,
  normalized_name text not null, details jsonb not null, created_at timestamptz not null default now(),
  unique(author_id,manuscript_id,character_id), unique(author_id,manuscript_id,normalized_name),
  foreign key(author_id,book_id,manuscript_id) references public.manuscripts(author_id,book_id,id),
  foreign key(author_id,intelligence_id) references public.book_intelligence(author_id,id),
  foreign key(author_id,character_id) references public.characters(author_id,id)
);
do $$ declare t text; begin
  foreach t in array array['manuscripts','manuscript_batches','book_intelligence','book_characters'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy manuscript_tenant_read on public.%I for select to authenticated using(private.can_read_author(author_id))',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create index %I on public.%I(author_id)',t||'_author_idx',t);
  end loop;
end $$;

create function private.manuscript_permission_valid(p_author_id uuid,p_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.manuscripts m
    join public.content_assets a on a.author_id=m.author_id and a.id=m.asset_id and a.book_id=m.book_id and a.source_id=m.source_id
    join public.sources s on s.author_id=m.author_id and s.id=m.source_id
    where m.author_id=p_author_id and m.id=p_id and a.rights_status='approved' and a.read_only and a.storage_path=m.storage_path
      and s.source_type='document' and s.metadata->>'permission_scope'='private_reference_analysis'
      and s.metadata->>'manuscript_id'=m.id::text and s.metadata->>'book_id'=m.book_id::text and s.metadata->>'content_hash'=m.content_hash);
$$;
revoke all on function private.manuscript_permission_valid(uuid,uuid) from public,anon,authenticated;

create function private.manuscript_begin_batch(p_author_id uuid,p_id uuid,p_request_id uuid,p_retry boolean,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.manuscripts; b public.manuscript_batches; pending public.manuscript_batches; ids uuid[]; chunk_rows jsonb; begin
  perform private.manuscript_writer(p_author_id,p_recording_key);
  if p_id is null or p_request_id is null or p_retry is null then raise exception 'Invalid processing request.' using errcode='22023'; end if;
  perform 1 from public.authors where id=p_author_id for update;
  select * into m from public.manuscripts where author_id=p_author_id and id=p_id for update;
  if not found then raise exception 'Manuscript unavailable.' using errcode='P0002'; end if;
  if not private.manuscript_permission_valid(p_author_id,p_id) then raise exception 'Manuscript permission is not valid.' using errcode='42501'; end if;
  select * into b from public.manuscript_batches where id=p_request_id;
  if found then
    if b.author_id<>p_author_id or b.manuscript_id<>p_id or b.created_by<>auth.uid() then raise exception 'This processing ID has already been used.' using errcode='40001'; end if;
    return jsonb_build_object('created',false,'batch',to_jsonb(b),'chunks','[]'::jsonb);
  end if;
  if m.status='ready' then return jsonb_build_object('created',false,'batch',null,'chunks','[]'::jsonb); end if;
  if m.chunk_count=0 or m.status='uploading' then raise exception 'Manuscript text is not ready.' using errcode='22023'; end if;
  select * into pending from public.manuscript_batches where author_id=p_author_id and manuscript_id=p_id and status='pending' for update;
  if found then
    if pending.created_at>now()-interval '2 minutes' then return jsonb_build_object('created',false,'batch',to_jsonb(pending),'chunks','[]'::jsonb); end if;
    if not p_retry then raise exception 'The interrupted batch needs an explicit retry.' using errcode='40001'; end if;
    update public.manuscript_batches set status='failed',error_code='interrupted',completed_at=now() where id=pending.id;
  elsif m.status='failed' and not p_retry then raise exception 'The failed batch needs an explicit retry.' using errcode='40001';
  end if;
  if (select count(*) from public.manuscript_batches where author_id=p_author_id and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=150 then
    raise exception 'The workspace has reached its daily manuscript processing limit.' using errcode='54000';
  end if;
  select array_agg(c.id order by c.chunk_index),jsonb_agg(jsonb_build_object('id',c.id,'chunk_index',c.chunk_index,'section',c.section,'reference_text',c.reference_text,'content_hash',c.content_hash) order by c.chunk_index)
    into ids,chunk_rows from (select k.* from public.knowledge_chunks k where k.author_id=p_author_id and k.manuscript_id=p_id
      and not exists(select 1 from public.manuscript_batches done where done.author_id=p_author_id and done.manuscript_id=p_id and done.status='complete' and k.id=any(done.chunk_ids))
      order by k.chunk_index limit 4) c;
  if ids is null then raise exception 'Manuscript processing state needs attention.' using errcode='22023'; end if;
  insert into public.manuscript_batches(id,author_id,manuscript_id,created_by,chunk_ids) values(p_request_id,p_author_id,p_id,auth.uid(),ids) returning * into b;
  update public.manuscripts set status='processing',error_code=null where id=p_id;
  return jsonb_build_object('created',true,'batch',to_jsonb(b),'chunks',chunk_rows);
end $$;

create function private.valid_manuscript_citations(p_author_id uuid,p_manuscript_id uuid,p_chunk_ids uuid[],citations jsonb)
returns boolean language plpgsql stable set search_path='' as $$ declare c jsonb; begin
  if citations is null or jsonb_typeof(citations) is distinct from 'array' or jsonb_array_length(citations) not between 1 and 4 then return false; end if;
  for c in select value from jsonb_array_elements(citations) loop
    if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>2 or not(c ?& array['chunk_id','quote'])
      or jsonb_typeof(c->'chunk_id') is distinct from 'string' or jsonb_typeof(c->'quote') is distinct from 'string'
      or length(trim(c->>'quote'))<1 or length(c->>'quote')>300 then return false; end if;
    if not exists(select 1 from public.knowledge_chunks where author_id=p_author_id and manuscript_id=p_manuscript_id and id=(c->>'chunk_id')::uuid and id=any(p_chunk_ids) and strpos(reference_text,c->>'quote')>0) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function private.valid_manuscript_citations(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;

create function private.valid_manuscript_result(p_author_id uuid,p_manuscript_id uuid,p_chunk_ids uuid[],value jsonb)
returns boolean language plpgsql stable set search_path='' as $$ declare item jsonb; part jsonb; field text; maxlen integer; begin
  if value is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>100000 or (select count(*) from jsonb_object_keys(value))<>2
    or not(value ?& array['facts','characters']) or jsonb_typeof(value->'facts') is distinct from 'array' or jsonb_typeof(value->'characters') is distinct from 'array'
    or jsonb_array_length(value->'facts')>16 or jsonb_array_length(value->'characters')>8 then return false; end if;
  for item in select * from jsonb_array_elements(value->'facts') loop
    if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>5 or not(item ?& array['category','statement','kind','spoiler','citations'])
      or jsonb_typeof(item->'category') is distinct from 'string' or item->>'category' not in ('genre','synopsis','theme','trope','tone','setting','plot','reader_promise','content','marketing_hook','comparable')
      or jsonb_typeof(item->'statement') is distinct from 'string' or length(trim(item->>'statement'))<1 or length(item->>'statement')>600
      or jsonb_typeof(item->'kind') is distinct from 'string' or item->>'kind' not in ('supported','inference') or jsonb_typeof(item->'spoiler') is distinct from 'boolean'
      or not private.valid_manuscript_citations(p_author_id,p_manuscript_id,p_chunk_ids,item->'citations') then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(value->'characters') loop
    if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>10
      or not(item ?& array['name','aliases','role','description','personality','relationships','arc','marketing_description','spoiler','citations'])
      or jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name'))<1 or length(item->>'name')>120
      or jsonb_typeof(item->'aliases') is distinct from 'array' or jsonb_array_length(item->'aliases')>8
      or jsonb_typeof(item->'spoiler') is distinct from 'boolean'
      or not private.valid_manuscript_citations(p_author_id,p_manuscript_id,p_chunk_ids,item->'citations') then return false; end if;
    for part in select * from jsonb_array_elements(item->'aliases') loop
      if jsonb_typeof(part) is distinct from 'string' or length(trim(part#>>'{}'))<1 or length(part#>>'{}')>120 then return false; end if;
    end loop;
    foreach field in array array['role','description','personality','relationships','arc','marketing_description'] loop
      maxlen:=case field when 'role' then 160 when 'personality' then 400 when 'marketing_description' then 400 else 600 end;
      if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>maxlen then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function private.valid_manuscript_result(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;

create function private.manuscript_finish_batch(p_author_id uuid,p_id uuid,p_request_id uuid,p_result jsonb,p_error_code text,p_usage jsonb,p_embeddings jsonb,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.manuscripts; b public.manuscript_batches; e jsonb; v jsonb; k text; vec extensions.vector(1536); seen uuid[]:='{}'; profile jsonb; intelligence uuid; ch jsonb; cid uuid; normalized text; begin
  perform private.manuscript_writer(p_author_id,p_recording_key);
  perform 1 from public.authors where id=p_author_id for update;
  select * into m from public.manuscripts where author_id=p_author_id and id=p_id for update;
  if not found then raise exception 'Manuscript unavailable.' using errcode='P0002'; end if;
  if not private.manuscript_permission_valid(p_author_id,p_id) then raise exception 'Manuscript permission is not valid.' using errcode='42501'; end if;
  select * into b from public.manuscript_batches where author_id=p_author_id and manuscript_id=p_id and id=p_request_id for update;
  if not found then raise exception 'Processing request unavailable.' using errcode='P0002'; end if;
  if b.created_by<>auth.uid() then raise exception 'This processing request belongs to another member.' using errcode='42501'; end if;
  if b.status<>'pending' then return jsonb_build_object('batch',to_jsonb(b),'manuscript',to_jsonb(m)); end if;
  if p_error_code is not null and p_error_code not in ('provider_unavailable','funding_required','timeout','invalid_output','policy_blocked','interrupted','embedding_unavailable') then raise exception 'Invalid processing failure.' using errcode='22023'; end if;
  if (p_error_code is null and not private.valid_manuscript_result(p_author_id,p_id,b.chunk_ids,p_result)) or (p_error_code is not null and p_result is not null) then raise exception 'Invalid manuscript result or citations.' using errcode='22023'; end if;
  if p_usage is null or jsonb_typeof(p_usage) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_usage))<>7
    or not(p_usage ?& array['inputTokens','outputTokens','embeddingTokens','estimatedCostUsd','gatewayGenerationId','embeddingGenerationId','embedding_status']) then raise exception 'Invalid processing usage.' using errcode='22023'; end if;
  foreach k in array array['inputTokens','outputTokens','embeddingTokens','estimatedCostUsd'] loop
    if jsonb_typeof(p_usage->k)='null' then continue; end if;
    if jsonb_typeof(p_usage->k) is distinct from 'number' then raise exception 'Invalid processing usage.' using errcode='22023'; end if;
    if (p_usage->>k)::numeric<0 or (p_usage->>k)::numeric>2147483647 or (k<>'estimatedCostUsd' and trunc((p_usage->>k)::numeric)<>(p_usage->>k)::numeric) then raise exception 'Invalid processing usage.' using errcode='22023'; end if;
  end loop;
  foreach k in array array['gatewayGenerationId','embeddingGenerationId'] loop
    if jsonb_typeof(p_usage->k)<>'null' and (jsonb_typeof(p_usage->k) is distinct from 'string' or p_usage->>k !~ '^[A-Za-z0-9_-]{1,200}$') then raise exception 'Invalid generation reference.' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(p_usage->'embedding_status') is distinct from 'string' or p_usage->>'embedding_status' not in ('not_started','complete','unavailable') then raise exception 'Invalid embedding status.' using errcode='22023'; end if;
  if p_embeddings is null or jsonb_typeof(p_embeddings) is distinct from 'array' then raise exception 'Invalid manuscript embeddings.' using errcode='22023'; end if;
  if p_error_code is not null and jsonb_array_length(p_embeddings)<>0 then raise exception 'Failed requests cannot store embeddings.' using errcode='22023'; end if;
  if p_error_code is null and ((p_usage->>'embedding_status'='complete' and jsonb_array_length(p_embeddings)<>cardinality(b.chunk_ids))
    or (p_usage->>'embedding_status'<>'complete' and jsonb_array_length(p_embeddings)<>0)) then raise exception 'Embedding status does not match the stored vectors.' using errcode='22023'; end if;
  for e in select value from jsonb_array_elements(p_embeddings) loop
    if jsonb_typeof(e) is distinct from 'object' or (select count(*) from jsonb_object_keys(e))<>3 or not(e ?& array['chunk_id','embedding','model'])
      or jsonb_typeof(e->'chunk_id') is distinct from 'string' or jsonb_typeof(e->'model') is distinct from 'string' or e->>'model'<>'openai/text-embedding-3-small'
      or jsonb_typeof(e->'embedding') is distinct from 'array' or jsonb_array_length(e->'embedding')<>1536 then raise exception 'Invalid manuscript embeddings.' using errcode='22023'; end if;
    if not ((e->>'chunk_id')::uuid=any(b.chunk_ids)) or (e->>'chunk_id')::uuid=any(seen) then raise exception 'Embedding chunk does not belong to this batch.' using errcode='22023'; end if;
    for v in select value from jsonb_array_elements(e->'embedding') loop
      if jsonb_typeof(v) is distinct from 'number' or abs((v#>>'{}')::numeric)>1000000 then raise exception 'Invalid embedding component.' using errcode='22023'; end if;
    end loop;
    vec:=(e->'embedding')::text::extensions.vector(1536);
    if extensions.vector_norm(vec)=0 then raise exception 'Embedding must not be a zero vector.' using errcode='22023'; end if;
    update public.knowledge_chunks set embedding=vec,embedding_model=e->>'model' where author_id=p_author_id and manuscript_id=p_id and id=(e->>'chunk_id')::uuid;
    seen:=array_append(seen,(e->>'chunk_id')::uuid);
  end loop;
  update public.manuscript_batches set status=case when p_error_code is null then 'complete' else 'failed' end,result=p_result,error_code=p_error_code,
    input_tokens=(p_usage->>'inputTokens')::integer,output_tokens=(p_usage->>'outputTokens')::integer,embedding_tokens=(p_usage->>'embeddingTokens')::integer,
    estimated_cost_usd=(p_usage->>'estimatedCostUsd')::numeric,gateway_generation_id=p_usage->>'gatewayGenerationId',embedding_generation_id=p_usage->>'embeddingGenerationId',
    embedding_status=p_usage->>'embedding_status',completed_at=now() where id=p_request_id returning * into b;
  update public.manuscripts set completed_chunks=(select count(*) from public.knowledge_chunks c where c.author_id=p_author_id and c.manuscript_id=p_id and exists(
    select 1 from public.manuscript_batches done where done.author_id=p_author_id and done.manuscript_id=p_id and done.status='complete' and c.id=any(done.chunk_ids))) where id=p_id returning * into m;
  if p_error_code is not null then update public.manuscripts set status='failed',error_code=p_error_code where id=p_id returning * into m;
  elsif not exists(select 1 from public.knowledge_chunks c where c.author_id=p_author_id and c.manuscript_id=p_id and not exists(
    select 1 from public.manuscript_batches done where done.author_id=p_author_id and done.manuscript_id=p_id and done.status='complete' and c.id=any(done.chunk_ids))) then
    select jsonb_build_object('facts',coalesce((select jsonb_agg(f.value order by x.created_at,x.id,f.ordinality) from public.manuscript_batches x cross join lateral jsonb_array_elements(x.result->'facts') with ordinality f(value,ordinality) where x.author_id=p_author_id and x.manuscript_id=p_id and x.status='complete'),'[]'::jsonb),
      'characters',coalesce((select jsonb_agg(c.value order by x.created_at,x.id,c.ordinality) from public.manuscript_batches x cross join lateral jsonb_array_elements(x.result->'characters') with ordinality c(value,ordinality) where x.author_id=p_author_id and x.manuscript_id=p_id and x.status='complete'),'[]'::jsonb)) into profile;
    insert into public.book_intelligence(author_id,book_id,manuscript_id,profile) values(p_author_id,m.book_id,p_id,profile) returning id into intelligence;
    -- Names identify candidates within this book only. No cross-book auto-merge.
    for ch in select value from jsonb_array_elements(profile->'characters') loop
      normalized:=lower(regexp_replace(trim(ch->>'name'),'[[:space:]]+',' ','g'));
      select id into cid from public.characters where author_id=p_author_id and book_id=m.book_id and lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))=normalized order by created_at,id limit 1;
      if cid is null then insert into public.characters(author_id,book_id,source_id,name,approved_description,data_origin) values(p_author_id,m.book_id,m.source_id,trim(ch->>'name'),null,'manual') returning id into cid; end if;
      insert into public.book_characters(author_id,book_id,manuscript_id,intelligence_id,character_id,normalized_name,details)
        values(p_author_id,m.book_id,p_id,intelligence,cid,normalized,jsonb_build_object('observations',jsonb_build_array(ch)))
        on conflict(author_id,manuscript_id,character_id) do update set details=jsonb_build_object('observations',public.book_characters.details->'observations'||jsonb_build_array(ch));
    end loop;
    update public.manuscripts set status='ready',error_code=null where id=p_id returning * into m;
    update public.books book set active_manuscript_id=p_id where book.author_id=p_author_id and book.id=m.book_id
      and (book.active_manuscript_id is null or (select version from public.manuscripts where id=book.active_manuscript_id)<m.version);
  end if;
  return jsonb_build_object('batch',to_jsonb(b),'manuscript',to_jsonb(m));
end $$;
revoke insert,update,delete on public.books from authenticated;
create trigger manuscripts_touch before update on public.manuscripts for each row execute function private.touch_updated_at();

create function private.manuscript_writer(p_author_id uuid,p_recording_key text) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform private.assert_studio_recording_key(p_recording_key);
  if auth.uid() is null or not private.can_edit_author(p_author_id) then raise exception 'Only an owner or editor can change manuscript knowledge.' using errcode='42501'; end if;
  perform set_config('kira.manuscript_recording_key',p_recording_key,true);
end $$;
revoke all on function private.manuscript_writer(uuid,text) from public,anon,authenticated;

-- Existing broad asset/chunk grants must not bypass the processing capability.
create function private.guard_manuscript_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare protected_author uuid; m public.manuscripts; row_author uuid; begin
  if tg_table_name='knowledge_chunks' then
    row_author:=case when tg_op='DELETE' then old.author_id else new.author_id end;
    select * into m from public.manuscripts where author_id=row_author and
      (source_id=case when tg_op='DELETE' then old.source_id else new.source_id end
       or asset_id=case when tg_op='DELETE' then old.asset_id else new.asset_id end
       or id=case when tg_op='DELETE' then old.manuscript_id else new.manuscript_id end) limit 1;
    if found then
      protected_author:=m.author_id;
      if tg_op<>'DELETE' and (new.manuscript_id is distinct from m.id or new.source_id is distinct from m.source_id or new.asset_id is distinct from m.asset_id) then
        raise exception 'Manuscript reference identity is immutable.' using errcode='42501';
      end if;
    end if;
    if tg_op='UPDATE' and protected_author is null then
      select author_id into protected_author from public.manuscripts where author_id=old.author_id and (id=old.manuscript_id or source_id=old.source_id or asset_id=old.asset_id) limit 1;
    end if;
  elsif tg_table_name='content_assets' then
    select author_id into protected_author from public.manuscripts where asset_id=old.id limit 1;
  elsif tg_table_name='sources' then
    select author_id into protected_author from public.manuscripts where source_id=old.id limit 1;
  elsif tg_table_name='characters' then
    select author_id into protected_author from public.book_characters where character_id=old.id limit 1;
  end if;
  if protected_author is not null then
    perform private.manuscript_writer(protected_author,current_setting('kira.manuscript_recording_key',true));
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.guard_manuscript_reference() from public,anon,authenticated;
create trigger protect_manuscript_chunks before insert or update or delete on public.knowledge_chunks for each row execute function private.guard_manuscript_reference();
create trigger protect_manuscript_assets before update or delete on public.content_assets for each row execute function private.guard_manuscript_reference();
create trigger protect_manuscript_sources before update or delete on public.sources for each row execute function private.guard_manuscript_reference();
create trigger protect_manuscript_characters before update or delete on public.characters for each row execute function private.guard_manuscript_reference();

create function private.library_save_book(p_author_id uuid,p_book_id uuid,p_title text,p_series_id uuid,p_series_name text,p_series_order integer,p_overview text,p_metadata jsonb,p_expected_updated_at timestamptz default null)
returns public.books language plpgsql security definer set search_path='' as $$
declare b public.books; sid uuid; source uuid; bid uuid:=coalesce(p_book_id,gen_random_uuid()); key text; begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then raise exception 'Only an owner or editor can edit books.' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 250 or (p_overview is not null and length(p_overview)>10000)
    or (p_series_order is not null and p_series_order<1) or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>12000
    or (p_series_id is not null and nullif(trim(p_series_name),'') is not null) then raise exception 'Invalid book details.' using errcode='22023'; end if;
  for key in select jsonb_object_keys(p_metadata) loop
    if key not in ('genre','audiobook_available','narrator','runtime_minutes','audio_notes') then raise exception 'Invalid book metadata.' using errcode='22023'; end if;
    if key in ('genre','narrator','audio_notes') and (jsonb_typeof(p_metadata->key)<>'string' or length(p_metadata->>key)>case when key='audio_notes' then 4000 else 200 end) then raise exception 'Invalid book metadata.' using errcode='22023'; end if;
    if key='audiobook_available' and jsonb_typeof(p_metadata->key)<>'boolean' then raise exception 'Invalid audio availability.' using errcode='22023'; end if;
    if key='runtime_minutes' and (jsonb_typeof(p_metadata->key)<>'number' or (p_metadata->>key)::numeric<=0 or (p_metadata->>key)::numeric>100000) then raise exception 'Invalid audio runtime.' using errcode='22023'; end if;
  end loop;
  perform 1 from public.authors where id=p_author_id for update;
  if p_book_id is not null then
    select * into b from public.books where author_id=p_author_id and id=p_book_id for update;
    if not found then raise exception 'Book unavailable.' using errcode='P0002'; end if;
    if p_expected_updated_at is null or b.updated_at<>p_expected_updated_at then raise exception 'Book changed. Reload before saving.' using errcode='40001'; end if;
  end if;
  if p_series_id is not null then
    select id into sid from public.series where author_id=p_author_id and id=p_series_id;
    if not found then raise exception 'Series unavailable.' using errcode='P0002'; end if;
  elsif nullif(trim(p_series_name),'') is not null then
    if length(trim(p_series_name))>200 then raise exception 'Series name is too long.' using errcode='22023'; end if;
    select id into sid from public.series where author_id=p_author_id and lower(trim(name))=lower(trim(p_series_name)) order by created_at,id limit 1;
  end if;
  insert into public.sources(author_id,name,source_type,retrieved_at,metadata,data_origin)
    values(p_author_id,'Member-supplied book details','human_feedback',now(),jsonb_build_object('submitted_by',auth.uid(),'previous_source_id',b.source_id,'title',trim(p_title)),'manual') returning id into source;
  if sid is null and nullif(trim(p_series_name),'') is not null then
    insert into public.series(author_id,source_id,name,data_origin) values(p_author_id,source,trim(p_series_name),'manual') returning id into sid;
  end if;
  if p_book_id is null then
    insert into public.books(id,author_id,series_id,source_id,slug,title,series_order,overview,metadata,data_origin)
      values(bid,p_author_id,sid,source,coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(p_title)),'[^a-z0-9]+','-','g')),''),'book')||'-'||substr(bid::text,1,8),trim(p_title),p_series_order,nullif(trim(p_overview),''),p_metadata,'manual') returning * into b;
  else
    update public.books set title=trim(p_title),series_id=sid,series_order=p_series_order,overview=nullif(trim(p_overview),''),metadata=p_metadata,
      source_id=source,data_origin='manual',verified_at=null,verified_fields='{}',verification_status='needs_verification'
      where author_id=p_author_id and id=bid returning * into b;
  end if;
  return b;
end $$;

create function private.manuscript_register(p_author_id uuid,p_id uuid,p_book_id uuid,p_filename text,p_mime_type text,p_size_bytes bigint,p_content_hash text,p_recording_key text)
returns public.manuscripts language plpgsql security definer set search_path='' as $$
declare m public.manuscripts; source uuid; asset uuid; ext text; path text; next_version integer; begin
  perform private.manuscript_writer(p_author_id,p_recording_key);
  if p_id is null or p_book_id is null or p_filename is null or length(p_filename) not between 1 and 255 or p_size_bytes is null or p_size_bytes not between 1 and 4194304
    or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid manuscript upload.' using errcode='22023'; end if;
  ext:=case p_mime_type when 'text/plain' then 'txt' when 'text/markdown' then 'md' when 'application/pdf' then 'pdf' when 'application/epub+zip' then 'epub' when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx' end;
  if ext is null then raise exception 'Unsupported manuscript file type.' using errcode='22023'; end if;
  perform 1 from public.authors where id=p_author_id for update;
  perform 1 from public.books where author_id=p_author_id and id=p_book_id for update;
  if not found then raise exception 'Book unavailable.' using errcode='P0002'; end if;
  select * into m from public.manuscripts where id=p_id;
  if found then
    if m.author_id<>p_author_id or m.book_id<>p_book_id or m.content_hash<>p_content_hash or m.permission_granted_by<>auth.uid() then raise exception 'This upload ID has already been used.' using errcode='40001'; end if;
    if m.status='failed' and m.error_code='storage_error' and m.chunk_count=0 then update public.manuscripts set status='uploading',error_code=null where id=m.id returning * into m; end if;
    return m;
  end if;
  select * into m from public.manuscripts where author_id=p_author_id and book_id=p_book_id and content_hash=p_content_hash;
  if found then
    if m.status='failed' and m.error_code='storage_error' and m.chunk_count=0 then
      if m.permission_granted_by<>auth.uid() then raise exception 'This upload belongs to another member.' using errcode='42501'; end if;
      update public.manuscripts set status='uploading',error_code=null where id=m.id returning * into m;
    end if;
    return m;
  end if;
  select coalesce(max(version),0)+1 into next_version from public.manuscripts where author_id=p_author_id and book_id=p_book_id;
  path:=p_author_id::text||'/'||p_book_id::text||'/'||p_id::text||'.'||ext;
  insert into public.sources(author_id,name,source_type,retrieved_at,metadata,data_origin)
    values(p_author_id,p_filename,'document',now(),jsonb_build_object('manuscript_id',p_id,'book_id',p_book_id,'content_hash',p_content_hash,'permission_scope','private_reference_analysis','submitted_by',auth.uid()),'manual') returning id into source;
  insert into public.content_assets(author_id,book_id,source_id,title,storage_path,asset_type,rights_status,read_only,data_origin)
    values(p_author_id,p_book_id,source,p_filename,path,'manuscript','approved',true,'manual') returning id into asset;
  insert into public.manuscripts(id,author_id,book_id,source_id,asset_id,filename,mime_type,size_bytes,content_hash,version,storage_path,permission_granted_by)
    values(p_id,p_author_id,p_book_id,source,asset,p_filename,p_mime_type,p_size_bytes,p_content_hash,next_version,path,auth.uid()) returning * into m;
  return m;
end $$;

create function private.manuscript_fail_upload(p_author_id uuid,p_id uuid,p_error_code text,p_recording_key text)
returns public.manuscripts language plpgsql security definer set search_path='' as $$ declare m public.manuscripts; begin
  perform private.manuscript_writer(p_author_id,p_recording_key);
  if p_error_code is distinct from 'storage_error' then raise exception 'Invalid upload failure.' using errcode='22023'; end if;
  select * into m from public.manuscripts where author_id=p_author_id and id=p_id for update;
  if not found then raise exception 'Manuscript unavailable.' using errcode='P0002'; end if;
  if m.permission_granted_by<>auth.uid() then raise exception 'This upload belongs to another member.' using errcode='42501'; end if;
  if m.status='uploading' then update public.manuscripts set status='failed',error_code='storage_error' where id=p_id returning * into m; end if;
  return m;
end $$;

create function private.manuscript_store_chunks(p_author_id uuid,p_id uuid,p_chunks jsonb,p_recording_key text)
returns public.manuscripts language plpgsql security definer set search_path='' as $$
declare m public.manuscripts; c jsonb; n integer:=0; existing jsonb; begin
  perform private.manuscript_writer(p_author_id,p_recording_key);
  if p_chunks is null or jsonb_typeof(p_chunks)<>'array' or jsonb_array_length(p_chunks) not between 1 and 500 or octet_length(p_chunks::text)>10000000 then raise exception 'Invalid manuscript chunks.' using errcode='22023'; end if;
  select * into m from public.manuscripts where author_id=p_author_id and id=p_id for update;
  if not found then raise exception 'Manuscript unavailable.' using errcode='P0002'; end if;
  if m.permission_granted_by<>auth.uid() then raise exception 'This upload belongs to another member.' using errcode='42501'; end if;
  if not private.manuscript_permission_valid(p_author_id,p_id) then raise exception 'Manuscript permission is not valid.' using errcode='42501'; end if;
  if m.status<>'uploading' then
    select jsonb_agg(jsonb_build_object('id',id,'chunk_index',chunk_index,'section',section,'reference_text',reference_text,'content_hash',content_hash) order by chunk_index) into existing from public.knowledge_chunks where author_id=p_author_id and manuscript_id=p_id;
    if existing=p_chunks then return m; end if;
    raise exception 'Manuscript chunks are already sealed.' using errcode='40001';
  end if;
  for c in select value from jsonb_array_elements(p_chunks) loop
    if jsonb_typeof(c)<>'object' or (select count(*) from jsonb_object_keys(c))<>5 or not(c ?& array['id','chunk_index','section','reference_text','content_hash'])
      or jsonb_typeof(c->'id')<>'string' or jsonb_typeof(c->'chunk_index')<>'number' or (c->>'chunk_index')::numeric<>n
      or jsonb_typeof(c->'section')<>'string' or length(trim(c->>'section')) not between 1 and 200
      or jsonb_typeof(c->'reference_text')<>'string' or length(trim(c->>'reference_text'))<1 or length(c->>'reference_text')>4000
      or jsonb_typeof(c->'content_hash')<>'string' or c->>'content_hash'<>encode(sha256(convert_to(c->>'reference_text','UTF8')),'hex') then raise exception 'Invalid manuscript chunks.' using errcode='22023'; end if;
    insert into public.knowledge_chunks(id,author_id,source_id,asset_id,manuscript_id,chunk_index,section,reference_text,content_hash,read_only,data_origin)
      values((c->>'id')::uuid,p_author_id,m.source_id,m.asset_id,p_id,n,trim(c->>'section'),c->>'reference_text',c->>'content_hash',true,'manual');
    n:=n+1;
  end loop;
  update public.manuscripts set status='queued',error_code=null,chunk_count=n where id=p_id returning * into m;
  return m;
end $$;

create function private.manuscript_search(p_author_id uuid,p_query text,p_embedding extensions.vector(1536) default null,p_book_id uuid default null,p_limit integer default 8)
returns table(book_id uuid,book_title text,manuscript_id uuid,chunk_id uuid,location text,excerpt text,score double precision)
language plpgsql stable security invoker set search_path='' as $$ begin
  if auth.uid() is null or not private.can_read_author(p_author_id) then raise exception 'Workspace access denied.' using errcode='42501'; end if;
  if p_query is null or length(trim(p_query)) not between 2 and 500 or p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid knowledge search.' using errcode='22023'; end if;
  if p_embedding is not null and (extensions.vector_dims(p_embedding)<>1536 or extensions.vector_norm(p_embedding)=0) then raise exception 'Invalid search embedding.' using errcode='22023'; end if;
  return query select b.id,b.title,m.id,c.id,c.section,left(c.reference_text,1000),
    (ts_rank_cd(to_tsvector('english',c.reference_text),plainto_tsquery('english',p_query))::double precision
      +case when p_embedding is not null and c.embedding is not null and c.embedding_model='openai/text-embedding-3-small'
        then greatest(0,1-(c.embedding operator(extensions.<=>) p_embedding)) else 0 end)::double precision as relevance
    from public.books b join public.manuscripts m on m.author_id=b.author_id and m.book_id=b.id and m.id=b.active_manuscript_id
    join public.knowledge_chunks c on c.author_id=m.author_id and c.manuscript_id=m.id and c.source_id=m.source_id and c.asset_id=m.asset_id
    join public.content_assets a on a.author_id=m.author_id and a.id=m.asset_id and a.book_id=m.book_id and a.source_id=m.source_id
    join public.sources s on s.author_id=m.author_id and s.id=m.source_id
    where b.author_id=p_author_id and (p_book_id is null or b.id=p_book_id) and m.status='ready'
      and a.rights_status='approved' and a.read_only and s.source_type='document' and s.metadata->>'permission_scope'='private_reference_analysis'
      and (to_tsvector('english',c.reference_text) @@ plainto_tsquery('english',p_query)
        or (p_embedding is not null and c.embedding is not null and c.embedding_model='openai/text-embedding-3-small'))
    order by relevance desc,b.id,c.chunk_index limit p_limit;
end $$;

create function public.library_save_book(p_author_id uuid,p_book_id uuid,p_title text,p_series_id uuid,p_series_name text,p_series_order integer,p_overview text,p_metadata jsonb,p_expected_updated_at timestamptz default null)
returns public.books language sql security invoker set search_path='' as $$ select private.library_save_book(p_author_id,p_book_id,p_title,p_series_id,p_series_name,p_series_order,p_overview,p_metadata,p_expected_updated_at); $$;
create function public.manuscript_register(p_author_id uuid,p_id uuid,p_book_id uuid,p_filename text,p_mime_type text,p_size_bytes bigint,p_content_hash text,p_recording_key text)
returns public.manuscripts language sql security invoker set search_path='' as $$ select private.manuscript_register(p_author_id,p_id,p_book_id,p_filename,p_mime_type,p_size_bytes,p_content_hash,p_recording_key); $$;
create function public.manuscript_fail_upload(p_author_id uuid,p_id uuid,p_error_code text,p_recording_key text)
returns public.manuscripts language sql security invoker set search_path='' as $$ select private.manuscript_fail_upload(p_author_id,p_id,p_error_code,p_recording_key); $$;
create function public.manuscript_store_chunks(p_author_id uuid,p_id uuid,p_chunks jsonb,p_recording_key text)
returns public.manuscripts language sql security invoker set search_path='' as $$ select private.manuscript_store_chunks(p_author_id,p_id,p_chunks,p_recording_key); $$;
create function public.manuscript_begin_batch(p_author_id uuid,p_id uuid,p_request_id uuid,p_retry boolean,p_recording_key text)
returns jsonb language sql security invoker set search_path='' as $$ select private.manuscript_begin_batch(p_author_id,p_id,p_request_id,p_retry,p_recording_key); $$;
create function public.manuscript_finish_batch(p_author_id uuid,p_id uuid,p_request_id uuid,p_result jsonb,p_error_code text,p_usage jsonb,p_embeddings jsonb,p_recording_key text)
returns jsonb language sql security invoker set search_path='' as $$ select private.manuscript_finish_batch(p_author_id,p_id,p_request_id,p_result,p_error_code,p_usage,p_embeddings,p_recording_key); $$;
create function public.manuscript_search(p_author_id uuid,p_query text,p_embedding extensions.vector(1536) default null,p_book_id uuid default null,p_limit integer default 8)
returns table(book_id uuid,book_title text,manuscript_id uuid,chunk_id uuid,location text,excerpt text,score double precision)
language sql stable security invoker set search_path='' as $$ select * from private.manuscript_search(p_author_id,p_query,p_embedding,p_book_id,p_limit); $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in ('library_save_book','manuscript_register','manuscript_fail_upload','manuscript_store_chunks','manuscript_begin_batch','manuscript_finish_batch','manuscript_search') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;

-- Supabase manages Storage's schema. PGlite tests install a faithful RLS stub;
-- other SQL-only environments may omit Storage without preventing schema tests.
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    execute $policy$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('kira-manuscripts','kira-manuscripts',false,4194304,array['text/plain','text/markdown','application/pdf','application/epub+zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
      on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$policy$;
    execute $policy$create policy kira_manuscript_read on storage.objects for select to authenticated using(
      bucket_id='kira-manuscripts' and exists(select 1 from public.manuscripts m where m.storage_path=name and private.can_read_author(m.author_id)))$policy$;
    execute $policy$create policy kira_manuscript_upload on storage.objects for insert to authenticated with check(
      bucket_id='kira-manuscripts' and exists(select 1 from public.manuscripts m where m.storage_path=name and m.status='uploading' and m.permission_granted_by=auth.uid() and private.can_edit_author(m.author_id)))$policy$;
    -- Restrictive guards prevent unrelated permissive Storage policies from
    -- accidentally exposing this bucket or allowing overwrite/delete.
    execute $policy$create policy kira_manuscript_read_guard on storage.objects as restrictive for select to authenticated using(
      bucket_id<>'kira-manuscripts' or exists(select 1 from public.manuscripts m where m.storage_path=name and private.can_read_author(m.author_id)))$policy$;
    execute $policy$create policy kira_manuscript_upload_guard on storage.objects as restrictive for insert to authenticated with check(
      bucket_id<>'kira-manuscripts' or exists(select 1 from public.manuscripts m where m.storage_path=name and m.status='uploading' and m.permission_granted_by=auth.uid() and private.can_edit_author(m.author_id)))$policy$;
    execute $policy$create policy kira_manuscript_no_overwrite on storage.objects as restrictive for update to authenticated using(bucket_id<>'kira-manuscripts') with check(bucket_id<>'kira-manuscripts')$policy$;
    execute $policy$create policy kira_manuscript_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'kira-manuscripts')$policy$;
    execute $policy$create policy kira_manuscript_no_anonymous on storage.objects as restrictive for all to anon using(bucket_id<>'kira-manuscripts') with check(bucket_id<>'kira-manuscripts')$policy$;
  end if;
end $$;
comment on table public.manuscripts is 'Private, immutable manuscript versions. Permission permits private read-only analysis, not publication or fiction generation.';
comment on table public.book_intelligence is 'Unreviewed extracted observations and marketing inferences with exact batch-bound citations. No hidden chain of thought.';
