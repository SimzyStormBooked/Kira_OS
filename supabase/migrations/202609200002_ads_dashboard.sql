-- Private read-only advertising reports. No campaign/budget mutation capability.
create table private.ads_connections(author_id uuid primary key references public.authors(id),actor_id uuid not null references auth.users(id),meta_user_id text not null,ciphertext text not null,accounts jsonb not null,selected text,expires_at timestamptz not null,connected_at timestamptz not null default now(),revision uuid not null default gen_random_uuid());
create table private.ads_oauth(author_id uuid not null references public.authors(id),actor_id uuid not null references auth.users(id),state_hash text not null,consumed boolean not null default false,created_at timestamptz not null default now(),primary key(author_id,actor_id));
create table public.ads_jobs(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),actor_id uuid not null references auth.users(id),revision uuid not null,account_id text not null,state text not null default 'queued' check(state in ('queued','running','complete','failed','cancelled')),run_id text,error_code text,scheduled_day date,send_email boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(author_id,scheduled_day));
create unique index ads_one_active on public.ads_jobs(author_id) where state in ('queued','running');
create table public.ads_reports(id uuid primary key references public.ads_jobs(id),author_id uuid not null references public.authors(id),account_id text not null,snapshot jsonb not null check(snapshot->>'data_origin' in ('meta_api','manual_snapshot')),created_at timestamptz not null default now());
create table public.ads_book_links(author_id uuid not null references public.authors(id),campaign_id text not null,book_id uuid not null references public.books(id) on delete cascade,primary key(author_id,campaign_id));
create table public.ads_subscriptions(author_id uuid not null references public.authors(id),user_id uuid not null references auth.users(id),enabled boolean not null default false,updated_at timestamptz not null default now(),primary key(author_id,user_id));
create table public.ads_deliveries(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),report_id uuid not null references public.ads_reports(id) on delete cascade,user_id uuid not null references auth.users(id),status text not null default 'pending' check(status in ('pending','sending','accepted','delivered','bounced','complained','suppressed','failed','cancelled')),provider_id text unique,event_at timestamptz,created_at timestamptz not null default now(),unique(report_id,user_id));
create table public.ads_inspiration(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.authors(id),title text not null,url text not null,note text not null,created_at timestamptz not null default now());
alter table public.ads_inspiration enable row level security;
grant select on public.ads_inspiration to authenticated;
create policy ads_inspiration_read on public.ads_inspiration for select to authenticated using(private.can_read_author(author_id));
create table private.ads_delivery_events(event_id text primary key,created_at timestamptz not null default now());
revoke all on private.ads_connections,private.ads_oauth,private.ads_delivery_events from public,anon,authenticated;
alter table public.ads_jobs enable row level security;
alter table public.ads_reports enable row level security;
alter table public.ads_book_links enable row level security;
alter table public.ads_subscriptions enable row level security;
alter table public.ads_deliveries enable row level security;
grant select on public.ads_jobs,public.ads_reports,public.ads_book_links,public.ads_subscriptions,public.ads_deliveries to authenticated;
create policy ads_jobs_read on public.ads_jobs for select to authenticated using(private.can_read_author(author_id));
create policy ads_reports_read on public.ads_reports for select to authenticated using(private.can_read_author(author_id));
create policy ads_links_read on public.ads_book_links for select to authenticated using(private.can_read_author(author_id));
create policy ads_subscription_read on public.ads_subscriptions for select to authenticated using(private.can_read_author(author_id) and user_id=auth.uid());
create policy ads_delivery_read on public.ads_deliveries for select to authenticated using(private.can_read_author(author_id) and user_id=auth.uid());

create function private.ads_control(p_author_id uuid,p_action text,p_payload jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ads_connections; j public.ads_jobs; o private.ads_oauth; begin
 perform private.assert_studio_recording_key(p_key);
 if not private.can_read_author(p_author_id) then raise exception 'Access denied' using errcode='42501'; end if;
 perform 1 from public.authors where id=p_author_id for update;
 select * into c from private.ads_connections where author_id=p_author_id;
 if p_action='view' then
  return case when c.author_id is null then 'null'::jsonb else jsonb_build_object('accounts',c.accounts,'selected',c.selected,'expiresAt',c.expires_at,'connectedAt',c.connected_at) end;
 elsif p_action='subscribe' then
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'Invalid setting' using errcode='22023'; end if;
  insert into public.ads_subscriptions(author_id,user_id,enabled) values(p_author_id,auth.uid(),(p_payload->>'enabled')::boolean) on conflict(author_id,user_id) do update set enabled=excluded.enabled,updated_at=now();
  return '{}'::jsonb;
 end if;
 if not private.can_edit_author(p_author_id) then raise exception 'Editor required' using errcode='42501'; end if;
 if p_action='begin' then
  if p_payload->>'hash' is null or p_payload->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid state' using errcode='22023'; end if;
  insert into private.ads_oauth(author_id,actor_id,state_hash) values(p_author_id,auth.uid(),p_payload->>'hash') on conflict(author_id,actor_id) do update set state_hash=excluded.state_hash,consumed=false,created_at=now();
 elsif p_action in ('consume','connect') then
  select * into o from private.ads_oauth where author_id=p_author_id and actor_id=auth.uid() and state_hash=p_payload->>'hash' and created_at>now()-interval '10 minutes' for update;
  if not found or (p_action='consume' and o.consumed) or (p_action='connect' and not o.consumed) then raise exception 'Expired authorization' using errcode='22023'; end if;
  if p_action='consume' then update private.ads_oauth set consumed=true where author_id=p_author_id and actor_id=auth.uid();
  else
   if jsonb_typeof(p_payload->'accounts') is distinct from 'array' or jsonb_array_length(p_payload->'accounts') not between 1 and 100 or length(p_payload->>'ciphertext') not between 1 and 50000 or (p_payload->>'expiresAt')::timestamptz<=now() then raise exception 'Invalid authorization' using errcode='22023'; end if;
   insert into private.ads_connections(author_id,actor_id,meta_user_id,ciphertext,accounts,expires_at) values(p_author_id,auth.uid(),p_payload->>'metaUserId',p_payload->>'ciphertext',p_payload->'accounts',(p_payload->>'expiresAt')::timestamptz)
    on conflict(author_id) do update set actor_id=excluded.actor_id,meta_user_id=excluded.meta_user_id,ciphertext=excluded.ciphertext,accounts=excluded.accounts,expires_at=excluded.expires_at,connected_at=now(),revision=gen_random_uuid(),selected=null;
   update public.ads_jobs set state='cancelled',updated_at=now() where author_id=p_author_id and state in ('queued','running');
   delete from private.ads_oauth where author_id=p_author_id and actor_id=auth.uid();
  end if;
 elsif p_action='select' then
  if c.author_id is null or c.expires_at<=now() or not exists(select 1 from jsonb_array_elements(c.accounts) a where a->>'id'=p_payload->>'accountId') then raise exception 'Account unavailable' using errcode='22023'; end if;
  update private.ads_connections set selected=p_payload->>'accountId',revision=gen_random_uuid() where author_id=p_author_id;
  update public.ads_jobs set state='cancelled',updated_at=now() where author_id=p_author_id and state in ('queued','running');
 elsif p_action='disconnect' then
  delete from private.ads_connections where author_id=p_author_id;
  delete from private.ads_oauth where author_id=p_author_id;
  update public.ads_jobs set state='cancelled',updated_at=now() where author_id=p_author_id and state in ('queued','running');
  delete from public.ads_reports where author_id=p_author_id;
  delete from public.ads_book_links where author_id=p_author_id;
  update public.ads_subscriptions set enabled=false,updated_at=now() where author_id=p_author_id;
 elsif p_action='inspiration' then
  if length(p_payload->>'title') not between 1 and 200 or length(p_payload->>'note')>2000 or p_payload->>'url' !~ '^https://(www\.)?facebook\.com/ads/library' then raise exception 'Invalid inspiration' using errcode='22023'; end if;
  if (select count(*) from public.ads_inspiration where author_id=p_author_id)>=50 then raise exception 'Inspiration library is full' using errcode='22023'; end if;
  insert into public.ads_inspiration(author_id,title,url,note) values(p_author_id,p_payload->>'title',p_payload->>'url',coalesce(p_payload->>'note',''));
 elsif p_action='remove_inspiration' then delete from public.ads_inspiration where author_id=p_author_id and id=(p_payload->>'id')::uuid;
 elsif p_action='link' then
  if p_payload->>'campaignId' is null or p_payload->>'campaignId' !~ '^[0-9]{1,30}$' then raise exception 'Invalid campaign' using errcode='22023'; end if;
  if p_payload->>'bookId' is null then delete from public.ads_book_links where author_id=p_author_id and campaign_id=p_payload->>'campaignId';
  else
   if not exists(select 1 from public.books where id=(p_payload->>'bookId')::uuid and author_id=p_author_id) then raise exception 'Book unavailable' using errcode='42501'; end if;
   insert into public.ads_book_links(author_id,campaign_id,book_id) values(p_author_id,p_payload->>'campaignId',(p_payload->>'bookId')::uuid) on conflict(author_id,campaign_id) do update set book_id=excluded.book_id;
  end if;
 elsif p_action='import' then
  if p_payload->'snapshot'->>'data_origin' is distinct from 'manual_snapshot' or p_payload->'snapshot'->'account'->>'id' is distinct from 'act_0' then raise exception 'Invalid import' using errcode='22023'; end if;
  if exists(select 1 from public.ads_jobs where author_id=p_author_id and created_at>now()-interval '1 minute') then raise exception 'Wait before another import' using errcode='55P03'; end if;
  insert into public.ads_jobs(author_id,actor_id,revision,account_id,state) values(p_author_id,auth.uid(),gen_random_uuid(),'act_0','complete') returning * into j;
  insert into public.ads_reports(id,author_id,account_id,snapshot) values(j.id,p_author_id,'act_0',p_payload->'snapshot');
  return to_jsonb(j);
 elsif p_action='sync' then
  if c.selected is null or c.expires_at<=now() then raise exception 'Reconnect and select an account' using errcode='22023'; end if;
  update public.ads_jobs set state='failed',error_code='interrupted',updated_at=now() where author_id=p_author_id and state in ('queued','running') and updated_at<now()-interval '10 minutes';
  select * into j from public.ads_jobs where author_id=p_author_id and state in ('queued','running');
  if found then return to_jsonb(j); end if;
  if exists(select 1 from public.ads_jobs where author_id=p_author_id and created_at>now()-interval '5 minutes') then raise exception 'Please wait five minutes between refreshes' using errcode='55P03'; end if;
  insert into public.ads_jobs(author_id,actor_id,revision,account_id) values(p_author_id,auth.uid(),c.revision,c.selected) returning * into j;
  return to_jsonb(j);
 else raise exception 'Invalid action' using errcode='22023'; end if;
 return '{}'::jsonb;
end $$;

-- Workers receive IDs only. Credentials are confined to a server step and never a workflow result.
create function private.ads_worker(p_action text,p_id uuid,p_run text,p_payload jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ads_connections; j public.ads_jobs; d public.ads_deliveries; u record; ids jsonb:='[]'::jsonb; day date:=(now() at time zone 'America/Phoenix')::date; begin
 perform private.assert_studio_recording_key(p_key);
 if p_action='schedule' then
  for c in select * from private.ads_connections where selected is not null and expires_at>now() loop
   perform 1 from public.authors where id=c.author_id for update;
   perform set_config('request.jwt.claim.sub',c.actor_id::text,true);
   if not private.can_edit_author(c.author_id) then continue; end if;
   update public.ads_jobs set state='failed',error_code='interrupted',updated_at=now() where author_id=c.author_id and state in ('queued','running') and updated_at<now()-interval '10 minutes';
   select * into j from public.ads_jobs where author_id=c.author_id and state in ('queued','running');
   if found then
    if j.state='queued' then ids:=ids||jsonb_build_array(j.id); end if;
    continue;
   end if;
   insert into public.ads_jobs(author_id,actor_id,revision,account_id,scheduled_day,send_email) values(c.author_id,c.actor_id,c.revision,c.selected,day,extract(isodow from day) in (1,4)) on conflict(author_id,scheduled_day) do nothing returning * into j;
   if found then ids:=ids||jsonb_build_array(j.id); end if;
  end loop; return ids;
 elsif p_action='pending_emails' then
  update public.ads_deliveries set status='cancelled' where status='pending' and created_at<now()-interval '24 hours';
  return coalesce((select jsonb_agg(id) from (select id from public.ads_deliveries where status='pending' order by created_at limit 100) pending),'[]'::jsonb);
 elsif p_action='revoke' then
  for c in select * from private.ads_connections where meta_user_id=p_payload->>'metaUserId' loop
   perform 1 from public.authors where id=c.author_id for update;
   delete from private.ads_connections where author_id=c.author_id;
   delete from public.ads_reports where author_id=c.author_id;
   delete from private.ads_oauth where author_id=c.author_id;
   update public.ads_jobs set state='cancelled',updated_at=now() where author_id=c.author_id and state in ('queued','running');
   update public.ads_subscriptions set enabled=false,updated_at=now() where author_id=c.author_id;
  end loop; return '{}'::jsonb;
 elsif p_action='unsubscribe' then
  update public.ads_subscriptions set enabled=false,updated_at=now() where author_id=(p_payload->>'authorId')::uuid and user_id=p_id; return '{}'::jsonb;
 elsif p_action='event' then
  if p_payload->>'status' not in ('delivered','bounced','complained','suppressed') then return '{}'::jsonb; end if;
  if not exists(select 1 from public.ads_deliveries where provider_id=p_payload->>'providerId') then raise exception 'Delivery receipt pending' using errcode='55P03'; end if;
  insert into private.ads_delivery_events(event_id) values(p_payload->>'eventId') on conflict do nothing;
  if not found then return '{}'::jsonb; end if;
  update public.ads_deliveries set status=p_payload->>'status',event_at=(p_payload->>'at')::timestamptz where provider_id=p_payload->>'providerId' and (event_at is null or event_at<=(p_payload->>'at')::timestamptz) and (status not in ('bounced','complained','suppressed') or p_payload->>'status' in ('bounced','complained','suppressed')) returning * into d;
  if found and d.status in ('bounced','complained','suppressed') then update public.ads_subscriptions set enabled=false,updated_at=now() where author_id=d.author_id and user_id=d.user_id; end if;
  return '{}'::jsonb;
 elsif p_action in ('email_claim','email_finish') then
  select * into d from public.ads_deliveries where id=p_id for update;
  if not found then return 'null'::jsonb; end if;
  if p_action='email_finish' then
   if d.status='sending' then update public.ads_deliveries set status=case when p_payload->>'providerId' is null then 'failed' else 'accepted' end,provider_id=p_payload->>'providerId' where id=d.id; end if; return '{}'::jsonb;
  end if;
  if d.status<>'pending' then return 'null'::jsonb; end if;
  perform set_config('request.jwt.claim.sub',d.user_id::text,true);
  if not private.can_read_author(d.author_id) or not exists(select 1 from public.ads_subscriptions where author_id=d.author_id and user_id=d.user_id and enabled) or not exists(select 1 from private.ads_connections connection_row join public.ads_jobs report_job on report_job.id=d.report_id and report_job.revision=connection_row.revision and report_job.account_id=connection_row.selected where connection_row.author_id=d.author_id and connection_row.expires_at>now()) then update public.ads_deliveries set status='cancelled' where id=d.id; return 'null'::jsonb; end if;
  select email,email_confirmed_at into u from auth.users where id=d.user_id;
  if u.email is null or u.email_confirmed_at is null then update public.ads_deliveries set status='cancelled' where id=d.id; return 'null'::jsonb; end if;
  update public.ads_deliveries set status='sending' where id=d.id;
  return jsonb_build_object('email',u.email,'userId',d.user_id,'authorId',d.author_id,'reportId',d.report_id,'snapshot',(select snapshot from public.ads_reports where id=d.report_id));
 end if;
 select * into j from public.ads_jobs where id=p_id;
 if not found then raise exception 'Job unavailable' using errcode='P0002'; end if;
 perform 1 from public.authors where id=j.author_id for update;
 select * into j from public.ads_jobs where id=p_id for update;
 select * into c from private.ads_connections where author_id=j.author_id;
 perform set_config('request.jwt.claim.sub',j.actor_id::text,true);
 if not private.can_edit_author(j.author_id) or c.author_id is null or c.revision<>j.revision or c.expires_at<=now() then update public.ads_jobs set state='cancelled',updated_at=now() where id=j.id; return 'null'::jsonb; end if;
 if p_run is null or length(p_run) not between 1 and 200 or (j.run_id is not null and j.run_id<>p_run) then return 'null'::jsonb; end if;
 if p_action='claim' then
  if j.state<>'queued' then return 'null'::jsonb; end if;
  update public.ads_jobs set state='running',run_id=p_run,updated_at=now() where id=j.id;
  return jsonb_build_object('authorId',j.author_id,'ciphertext',c.ciphertext,'metaUserId',c.meta_user_id,'accountId',j.account_id,
   'allowAi',(select count(*) from public.ads_jobs where author_id=j.author_id and created_at>=date_trunc('day',now()) and account_id<>'act_0' and run_id is not null)<=4,
   'books',coalesce((select jsonb_agg(x) from (select b.id,b.title,b.overview,b.active_manuscript_id,
    (select jsonb_agg(f) from (select value as f from public.book_intelligence bi cross join lateral jsonb_array_elements(bi.profile->'facts') where bi.manuscript_id=b.active_manuscript_id and bi.author_id=j.author_id and value->>'spoiler'='false' and value->>'category' in ('theme','trope','genre','tone','reader_promise') limit 6) ff) as facts
    from public.books b where b.author_id=j.author_id and exists(select 1 from public.ads_book_links l where l.author_id=j.author_id and l.book_id=b.id) limit 4) x),'[]'::jsonb));
 elsif p_action='finish' then
  if j.state<>'running' then return '[]'::jsonb; end if;
  if p_payload->'snapshot'->>'data_origin' is distinct from 'meta_api' or p_payload->'snapshot'->'account'->>'id' is distinct from j.account_id then raise exception 'Invalid report' using errcode='22023'; end if;
  insert into public.ads_reports(id,author_id,account_id,snapshot) values(j.id,j.author_id,j.account_id,p_payload->'snapshot');
  update public.ads_jobs set state='complete',updated_at=now() where id=j.id;
  if j.send_email then
   insert into public.ads_deliveries(author_id,report_id,user_id) select j.author_id,j.id,user_id from public.ads_subscriptions where author_id=j.author_id and enabled on conflict do nothing;
   select coalesce(jsonb_agg(id),'[]'::jsonb) into ids from public.ads_deliveries where report_id=j.id and status='pending';
  end if; return ids;
 elsif p_action='fail' then
  update public.ads_jobs set state='failed',error_code=case when p_payload->>'code' in ('reconnect','permissions','provider_unavailable','email_setup') then p_payload->>'code' else 'interrupted' end,updated_at=now() where id=j.id and state in ('queued','running');
 else raise exception 'Invalid action' using errcode='22023'; end if;
 return '{}'::jsonb;
end $$;
revoke all on function private.ads_control(uuid,text,jsonb,text),private.ads_worker(text,uuid,text,jsonb,text) from public,anon,authenticated;
create function public.ads_control(p_author_id uuid,p_action text,p_payload jsonb,p_key text) returns jsonb language sql security invoker set search_path='' as $$ select private.ads_control(p_author_id,p_action,p_payload,p_key) $$;
create function public.ads_worker(p_action text,p_id uuid,p_run text,p_payload jsonb,p_key text) returns jsonb language sql security invoker set search_path='' as $$ select private.ads_worker(p_action,p_id,p_run,p_payload,p_key) $$;
-- Invoker wrappers need execute on the narrowly scoped capability-checking implementation.
grant usage on schema private to authenticated,anon;
grant execute on function private.ads_control(uuid,text,jsonb,text) to authenticated;
grant execute on function private.ads_worker(text,uuid,text,jsonb,text) to anon;
revoke all on function public.ads_control(uuid,text,jsonb,text),public.ads_worker(text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.ads_control(uuid,text,jsonb,text) to authenticated;
grant execute on function public.ads_worker(text,uuid,text,jsonb,text) to anon;
