-- Private author discovery workspace. No publishing or retailer mutation capability.
create table public.discovery_pages(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),url text not null,label text not null,book_id uuid,kind text not null check(kind in ('website','book','series')),audit jsonb,updated_at timestamptz not null default now(),unique(author_id,url),unique(author_id,id),foreign key(author_id,book_id) references public.books(author_id,id));
create table public.discovery_listings(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),book_id uuid not null,amazon_url text not null,asin text not null,edition text not null,description text not null default '',keywords jsonb not null default '[]',categories jsonb not null default '[]',status text not null check(status in ('draft','reviewed')),version integer not null default 0,updated_at timestamptz not null default now(),unique(author_id,book_id,asin),foreign key(author_id,book_id) references public.books(author_id,id));
create table public.discovery_reports(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),snapshot jsonb not null,checksum text not null,created_at timestamptz not null default now(),unique(author_id,checksum));
create table public.discovery_actions(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),page_id uuid,book_id uuid,title text not null,detail text not null,status text not null default 'planned' check(status in ('planned','applied')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(author_id,book_id) references public.books(author_id,id),foreign key(author_id,page_id) references public.discovery_pages(author_id,id) on delete set null(page_id));
create table private.discovery_google(author_id uuid primary key references public.authors(id),actor_id uuid not null references auth.users(id),ciphertext text not null,properties jsonb not null,selected text,revision uuid not null default gen_random_uuid(),connected_at timestamptz not null default now(),last_error text);
create table private.discovery_oauth(author_id uuid not null references public.authors(id),actor_id uuid not null references auth.users(id),hash text not null,consumed boolean not null default false,created_at timestamptz not null default now(),primary key(author_id,actor_id));
create table public.discovery_jobs(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),actor_id uuid not null references auth.users(id),kind text not null check(kind in ('audit','search')),page_id uuid,revision uuid,property text,state text not null default 'queued' check(state in ('queued','running','complete','failed','cancelled')),run_id text,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(author_id,page_id) references public.discovery_pages(author_id,id) on delete cascade);
create index discovery_jobs_author_time on public.discovery_jobs(author_id,created_at desc);
create index discovery_reports_author_time on public.discovery_reports(author_id,created_at desc);
do $$ declare t text; begin
 foreach t in array array['discovery_pages','discovery_listings','discovery_reports','discovery_actions','discovery_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy author_read on public.%I for select to authenticated using (private.can_read_author(author_id))',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
revoke all on private.discovery_google,private.discovery_oauth from public,anon,authenticated;

create function private.discovery_control(p_author_id uuid,p_action text,p_payload jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid; p uuid; r uuid; v jsonb; g private.discovery_google%rowtype; existing public.discovery_listings%rowtype; j public.discovery_jobs%rowtype; a text;
begin
 perform private.assert_studio_recording_key(p_key);
 if not private.can_read_author(p_author_id) then raise exception 'Workspace unavailable' using errcode='42501'; end if;
 if p_action='view' then
  select * into g from private.discovery_google where author_id=p_author_id;
  return jsonb_build_object(
   'available',true,'canEdit',private.can_edit_author(p_author_id),
   'books',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title) order by title) from public.books where author_id=p_author_id),'[]'),
   'pages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'url',url,'label',label,'bookId',book_id,'kind',kind,'audit',audit,'updatedAt',updated_at) order by updated_at desc) from public.discovery_pages where author_id=p_author_id),'[]'),
   'listings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'bookId',book_id,'amazonUrl',amazon_url,'asin',asin,'edition',edition,'description',description,'keywords',keywords,'categories',categories,'status',status,'version',version,'updatedAt',updated_at) order by updated_at desc) from public.discovery_listings where author_id=p_author_id),'[]'),
   'actions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'pageId',page_id,'bookId',book_id,'title',title,'detail',detail,'status',status,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc) from public.discovery_actions where author_id=p_author_id),'[]'),
   'reports',coalesce((select jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot,'createdAt',created_at)) from (select * from public.discovery_reports where author_id=p_author_id order by created_at desc limit 12) s),'[]'),
   'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'pageId',page_id,'state',state,'error',error,'createdAt',created_at)) from (select * from public.discovery_jobs where author_id=p_author_id order by created_at desc limit 12) s),'[]'),
   'google',jsonb_build_object('configured',false,'connected',g.author_id is not null,'properties',coalesce(g.properties,'[]'),'selectedProperty',g.selected,'connectedAt',g.connected_at,'lastError',g.last_error));
 end if;
 if not private.can_edit_author(p_author_id) then raise exception 'Editing access required' using errcode='42501'; end if;
 perform 1 from public.authors where id=p_author_id for update;
 if octet_length(p_payload::text)>2200000 then raise exception 'Input too large' using errcode='22023'; end if;
 b:=nullif(p_payload->>'bookId','')::uuid;p:=nullif(p_payload->>'pageId','')::uuid;
 if b is not null and not exists(select 1 from public.books where id=b and author_id=p_author_id) then raise exception 'Book unavailable' using errcode='42501';end if;
 if p is not null and not exists(select 1 from public.discovery_pages where id=p and author_id=p_author_id) then raise exception 'Page unavailable' using errcode='42501';end if;
 if p_action='page' then
  if (select count(*) from public.discovery_pages where author_id=p_author_id)>=100 then raise exception 'Page limit' using errcode='22023';end if;
  if length(p_payload->>'url') not between 10 and 2000 or p_payload->>'url' not like 'https://%' or length(p_payload->>'label') not between 1 and 200 then raise exception 'Invalid page' using errcode='22023';end if;
  insert into public.discovery_pages(author_id,url,label,book_id,kind) values(p_author_id,p_payload->>'url',p_payload->>'label',b,p_payload->>'kind') returning id into r;
 elsif p_action='remove_page' then
  delete from public.discovery_pages where id=(p_payload->>'id')::uuid and author_id=p_author_id;
  if not found then raise exception 'Page unavailable' using errcode='P0002';end if;
 elsif p_action='listing' then
  a:=substring(p_payload->>'amazonUrl' from '/(?:dp|gp/product)/([A-Za-z0-9]{10})');
  if b is null or a is null or length(p_payload->>'description')>5000 or jsonb_array_length(p_payload->'keywords')>7 or jsonb_array_length(p_payload->'categories')>3 then raise exception 'Invalid listing' using errcode='22023';end if;
  select * into existing from public.discovery_listings where author_id=p_author_id and book_id=b and asin=upper(a) for update;
  if found then
   if existing.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'Listing changed' using errcode='40001';end if;
   update public.discovery_listings set amazon_url=p_payload->>'amazonUrl',edition=p_payload->>'edition',description=p_payload->>'description',keywords=p_payload->'keywords',categories=p_payload->'categories',status=p_payload->>'status',version=version+1,updated_at=now() where id=existing.id returning id into r;
  else
   if p_payload->>'expectedVersion' is not null then raise exception 'Listing changed' using errcode='40001';end if;
   insert into public.discovery_listings(author_id,book_id,amazon_url,asin,edition,description,keywords,categories,status) values(p_author_id,b,p_payload->>'amazonUrl',upper(a),p_payload->>'edition',p_payload->>'description',p_payload->'keywords',p_payload->'categories',p_payload->>'status') returning id into r;
  end if;
 elsif p_action='action' then
  if length(p_payload->>'title') not between 1 and 200 or length(p_payload->>'detail') not between 1 and 6000 then raise exception 'Invalid action' using errcode='22023';end if;
  insert into public.discovery_actions(author_id,page_id,book_id,title,detail) values(p_author_id,p,b,p_payload->>'title',p_payload->>'detail') returning id into r;
 elsif p_action='action_status' then
  update public.discovery_actions set status=p_payload->>'status',updated_at=now() where id=(p_payload->>'id')::uuid and author_id=p_author_id returning id into r;
  if not found then raise exception 'Action unavailable' using errcode='P0002';end if;
 elsif p_action='search' then
  v:=p_payload->'snapshot';if v->>'data_origin' is distinct from 'manual_snapshot' or jsonb_typeof(v->'rows') is distinct from 'array' or jsonb_array_length(v->'rows')>10000 then raise exception 'Invalid import' using errcode='22023';end if;
  insert into public.discovery_reports(author_id,snapshot,checksum) values(p_author_id,v,md5((v-'fetchedAt')::text)) on conflict(author_id,checksum) do nothing returning id into r;
 elsif p_action in ('audit','sync') then
  update public.discovery_jobs set state='failed',error='interrupted',updated_at=now() where author_id=p_author_id and state in ('queued','running') and created_at<now()-interval '10 minutes';
  select * into g from private.discovery_google where author_id=p_author_id;
  if p_action='audit' and p is null then raise exception 'Page required' using errcode='22023';end if;
  if p_action='sync' and (g.selected is null or p is not null) then raise exception 'Choose a connected property' using errcode='22023';end if;
  select * into j from public.discovery_jobs where author_id=p_author_id and kind=case when p_action='audit' then 'audit' else 'search' end and page_id is not distinct from p and state in ('queued','running') order by created_at desc limit 1;
  if found then return jsonb_build_object('id',j.id,'state',j.state);end if;
  if (select count(*) from public.discovery_jobs where author_id=p_author_id and created_at>now()-interval '1 day')>=40 or exists(select 1 from public.discovery_jobs where author_id=p_author_id and kind=case when p_action='audit' then 'audit' else 'search' end and page_id is not distinct from p and created_at>now()-interval '1 minute') then raise exception 'Wait before refreshing again' using errcode='55P03';end if;
  insert into public.discovery_jobs(author_id,actor_id,kind,page_id,revision,property) values(p_author_id,auth.uid(),case when p_action='audit' then 'audit' else 'search' end,p,g.revision,g.selected) returning id into r;
  return jsonb_build_object('id',r,'state','queued');
 else raise exception 'Unknown action' using errcode='22023';end if;
 return jsonb_build_object('id',r);
end $$;
create function public.discovery_control(p_author_id uuid,p_action text,p_payload jsonb,p_key text) returns jsonb language sql security invoker set search_path='' as $$select private.discovery_control(p_author_id,p_action,p_payload,p_key)$$;
revoke all on function private.discovery_control(uuid,text,jsonb,text),public.discovery_control(uuid,text,jsonb,text) from public,anon;
grant execute on function private.discovery_control(uuid,text,jsonb,text),public.discovery_control(uuid,text,jsonb,text) to authenticated;

create function private.discovery_google_control(p_author_id uuid,p_action text,p_payload jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.discovery_oauth%rowtype; g private.discovery_google%rowtype;
begin
 perform private.assert_studio_recording_key(p_key);
 if not private.can_edit_author(p_author_id) then raise exception 'Editing access required' using errcode='42501';end if;
 perform 1 from public.authors where id=p_author_id for update;
 if p_action='begin' then
  if p_payload->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid state' using errcode='22023';end if;
  insert into private.discovery_oauth(author_id,actor_id,hash) values(p_author_id,auth.uid(),p_payload->>'hash') on conflict(author_id,actor_id) do update set hash=excluded.hash,consumed=false,created_at=now();
 elsif p_action='consume' then
  update private.discovery_oauth set consumed=true where author_id=p_author_id and actor_id=auth.uid() and hash=p_payload->>'hash' and not consumed and created_at>now()-interval '10 minutes';
  if not found then raise exception 'State expired' using errcode='22023';end if;
 elsif p_action='connect' then
  delete from private.discovery_oauth where author_id=p_author_id and actor_id=auth.uid() and hash=p_payload->>'hash' and consumed and created_at>now()-interval '10 minutes' returning * into o;
  if not found or length(p_payload->>'ciphertext') not between 20 and 20000 or jsonb_typeof(p_payload->'properties') is distinct from 'array' or jsonb_array_length(p_payload->'properties')>100 then raise exception 'Invalid connection' using errcode='22023';end if;
  insert into private.discovery_google(author_id,actor_id,ciphertext,properties) values(p_author_id,auth.uid(),p_payload->>'ciphertext',p_payload->'properties') on conflict(author_id) do update set actor_id=excluded.actor_id,ciphertext=excluded.ciphertext,properties=excluded.properties,selected=null,revision=gen_random_uuid(),connected_at=now(),last_error=null;
  update public.discovery_jobs set state='cancelled',updated_at=now() where author_id=p_author_id and kind='search' and state in ('queued','running');
 elsif p_action='select' then
  select * into g from private.discovery_google where author_id=p_author_id;
  if not exists(select 1 from jsonb_array_elements(g.properties) s where s->>'siteUrl'=p_payload->>'property' and s->>'permissionLevel' in ('siteOwner','siteFullUser','siteRestrictedUser')) then raise exception 'Property unavailable' using errcode='22023';end if;
  update private.discovery_google set selected=p_payload->>'property',revision=gen_random_uuid(),last_error=null where author_id=p_author_id;
  update public.discovery_jobs set state='cancelled',updated_at=now() where author_id=p_author_id and kind='search' and state in ('queued','running');
 elsif p_action='disconnect' then
  delete from private.discovery_google where author_id=p_author_id returning * into g;
  delete from private.discovery_oauth where author_id=p_author_id;
  delete from public.discovery_reports where author_id=p_author_id and snapshot->>'data_origin'='google_api';
  update public.discovery_jobs set state='cancelled',updated_at=now() where author_id=p_author_id and kind='search' and state in ('queued','running');
  return case when g.author_id is null then 'null'::jsonb else jsonb_build_object('ciphertext',g.ciphertext,'actorId',g.actor_id) end;
 else raise exception 'Unknown action' using errcode='22023';end if;
 return '{}'::jsonb;
end $$;
create function public.discovery_google_control(p_author_id uuid,p_action text,p_payload jsonb,p_key text) returns jsonb language sql security invoker set search_path='' as $$select private.discovery_google_control(p_author_id,p_action,p_payload,p_key)$$;
revoke all on function private.discovery_google_control(uuid,text,jsonb,text),public.discovery_google_control(uuid,text,jsonb,text) from public,anon;
grant execute on function private.discovery_google_control(uuid,text,jsonb,text),public.discovery_google_control(uuid,text,jsonb,text) to authenticated;

create function private.discovery_worker(p_action text,p_id uuid,p_run text,p_payload jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.discovery_jobs%rowtype; g private.discovery_google%rowtype; v jsonb; url text;
begin
 perform private.assert_studio_recording_key(p_key);
 select * into j from public.discovery_jobs where id=p_id;
 if not found then return 'null'::jsonb;end if;
 perform 1 from public.authors where id=j.author_id for update;
 select * into j from public.discovery_jobs where id=p_id for update;
 if not found then return 'null'::jsonb;end if;
 if j.state not in ('queued','running') or (j.run_id is not null and j.run_id is distinct from p_run) then return 'null'::jsonb;end if;
 perform set_config('request.jwt.claim.sub',j.actor_id::text,true);
 if not private.can_edit_author(j.author_id) then update public.discovery_jobs set state='cancelled',updated_at=now() where id=j.id;return 'null'::jsonb;end if;
 if j.kind='search' then
  select * into g from private.discovery_google where author_id=j.author_id;
  if g.author_id is null or g.revision is distinct from j.revision or g.selected is distinct from j.property then update public.discovery_jobs set state='cancelled',updated_at=now() where id=j.id;return 'null'::jsonb;end if;
  perform set_config('request.jwt.claim.sub',g.actor_id::text,true);
  if not private.can_edit_author(j.author_id) then update public.discovery_jobs set state='cancelled',updated_at=now() where id=j.id;return 'null'::jsonb;end if;
 end if;
 if p_action='claim' then
  if j.state<>'queued' or p_run is null or length(p_run) not between 1 and 200 then return 'null'::jsonb;end if;
  update public.discovery_jobs set state='running',run_id=p_run,updated_at=now() where id=j.id;
  select dp.url into url from public.discovery_pages dp where dp.id=j.page_id and dp.author_id=j.author_id;
  return jsonb_build_object('authorId',j.author_id,'kind',j.kind,'url',url,'property',j.property,'ciphertext',g.ciphertext,'actorId',g.actor_id);
 elsif p_action='credential' and j.state='running' and j.kind='search' then
  if length(p_payload->>'ciphertext') not between 20 and 20000 then raise exception 'Invalid credential' using errcode='22023';end if;
  update private.discovery_google set ciphertext=p_payload->>'ciphertext' where author_id=j.author_id;
 elsif p_action='finish' and j.state='running' then
  if j.kind='audit' then
   v:=p_payload->'audit';if jsonb_typeof(v->'findings') is distinct from 'array' or length(v::text)>100000 then raise exception 'Invalid audit' using errcode='22023';end if;
   update public.discovery_pages set audit=v,updated_at=now() where id=j.page_id and author_id=j.author_id;
  else
   v:=p_payload->'snapshot';if v->>'data_origin' is distinct from 'google_api' or v->>'property' is distinct from j.property or jsonb_typeof(v->'rows') is distinct from 'array' or jsonb_array_length(v->'rows')>10000 or octet_length(v::text)>2200000 then raise exception 'Invalid report' using errcode='22023';end if;
   insert into public.discovery_reports(author_id,snapshot,checksum) values(j.author_id,v,md5(v::text)) on conflict(author_id,checksum) do nothing;
   update private.discovery_google set last_error=null where author_id=j.author_id;
  end if;
  update public.discovery_jobs set state='complete',updated_at=now() where id=j.id;
 elsif p_action='fail' then
  update public.discovery_jobs set state='failed',error=case when p_payload->>'code' in ('page_unavailable','robots_blocked','reconnect_google','interrupted') then p_payload->>'code' else 'interrupted' end,updated_at=now() where id=j.id;
  if j.kind='search' then update private.discovery_google set last_error='reconnect_or_retry' where author_id=j.author_id;end if;
 else return 'null'::jsonb;
 end if;
 return '{}'::jsonb;
end $$;
create function public.discovery_worker(p_action text,p_id uuid,p_run text,p_payload jsonb,p_key text) returns jsonb language sql security invoker set search_path='' as $$select private.discovery_worker(p_action,p_id,p_run,p_payload,p_key)$$;
revoke all on function private.discovery_worker(text,uuid,text,jsonb,text),public.discovery_worker(text,uuid,text,jsonb,text) from public;
grant usage on schema private to anon;
grant execute on function private.discovery_worker(text,uuid,text,jsonb,text),public.discovery_worker(text,uuid,text,jsonb,text) to anon,authenticated;
