-- Author judgement sits beside an immutable extraction. Indexes are scoped to a
-- manuscript version, and the source hash makes a stale review visibly invalid.
create table public.book_fact_reviews (
 author_id uuid not null,
 manuscript_id uuid not null,
 fact_index integer not null check (fact_index between 0 and 7999),
 source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
 judgement text not null check (judgement in ('confirmed','needs_check','do_not_use')),
 author_note text not null check (length(author_note) <= 1200),
 reviewed_by uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now(),
 primary key (author_id,manuscript_id,fact_index),
 foreign key (author_id,manuscript_id) references public.manuscripts(author_id,id) on delete cascade
);
alter table public.book_fact_reviews enable row level security;
revoke all on public.book_fact_reviews from public,anon,authenticated;
grant select on public.book_fact_reviews to authenticated;
create function private.book_fact_review_readable(a uuid,m uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_author(a) and private.manuscript_permission_valid(a,m);
$$;
revoke all on function private.book_fact_review_readable(uuid,uuid) from public,anon;
grant execute on function private.book_fact_review_readable(uuid,uuid) to authenticated;
create policy book_fact_reviews_read on public.book_fact_reviews for select to authenticated
 using (private.book_fact_review_readable(author_id,manuscript_id));

create function private.book_fact_review_save(a uuid,m uuid,i integer,j text,n text) returns public.book_fact_reviews
 language plpgsql security definer set search_path='' as $$
declare row public.book_fact_reviews;source_fact jsonb;hash text;begin
 if not private.can_edit_author(a) or not private.manuscript_permission_valid(a,m) then
  raise exception 'Manuscript review unavailable' using errcode='42501';
 end if;
 if i is null or i not between 0 and 7999 or j is null or j not in ('confirmed','needs_check','do_not_use')
    or n is null or length(n)>1200 then raise exception 'Invalid review' using errcode='22023';end if;
 select profile->'facts'->i into source_fact from public.book_intelligence where author_id=a and manuscript_id=m;
 if source_fact is null then raise exception 'Finding unavailable' using errcode='P0002';end if;
 hash:=encode(sha256(convert_to(source_fact::text,'UTF8')),'hex');
 insert into public.book_fact_reviews(author_id,manuscript_id,fact_index,source_hash,judgement,author_note,reviewed_by)
 values(a,m,i,hash,j,n,auth.uid())
 on conflict(author_id,manuscript_id,fact_index) do update set source_hash=excluded.source_hash,
  judgement=excluded.judgement,author_note=excluded.author_note,reviewed_by=excluded.reviewed_by,reviewed_at=now()
 returning * into row;
 return row;
end $$;
create function public.book_fact_review_save(p_author_id uuid,p_manuscript_id uuid,p_fact_index integer,p_judgement text,p_author_note text)
 returns public.book_fact_reviews language sql security invoker set search_path='' as $$
 select private.book_fact_review_save(p_author_id,p_manuscript_id,p_fact_index,p_judgement,p_author_note);
$$;
revoke all on function private.book_fact_review_save(uuid,uuid,integer,text,text) from public,anon;
revoke all on function public.book_fact_review_save(uuid,uuid,integer,text,text) from public,anon;
grant execute on function private.book_fact_review_save(uuid,uuid,integer,text,text) to authenticated;
grant execute on function public.book_fact_review_save(uuid,uuid,integer,text,text) to authenticated;

-- All new Raven and catalog requests skip disputed or rejected extracted facts.
create or replace function private.book_reference_context(a uuid,p_book_ids uuid[],question text,spoilers boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
   where bi.author_id=a and bi.manuscript_id=b.active_manuscript_id and x.value->>'kind'='supported' and (spoilers or x.value->>'spoiler'='false') and not exists(select 1 from public.book_fact_reviews review where review.author_id=a and review.manuscript_id=bi.manuscript_id and review.fact_index=x.ordinality-1 and review.judgement in ('needs_check','do_not_use') and review.source_hash=encode(sha256(convert_to(x.value::text,'UTF8')),'hex'))
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

create or replace function public.catalog_observations(a uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.can_read_author(a) then raise exception 'Workspace unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
  select b.id,b.slug,b.title,b.metadata,b.series_id,b.active_manuscript_id as manuscript_id,
   (select coalesce(jsonb_agg(f.value),'[]') from (select x.value from jsonb_array_elements(bi.profile->'facts') with ordinality x(value,ordinality) where x.value->>'kind'='supported' and not exists(select 1 from public.book_fact_reviews review where review.author_id=a and review.manuscript_id=bi.manuscript_id and review.fact_index=x.ordinality-1 and review.judgement in ('needs_check','do_not_use') and review.source_hash=encode(sha256(convert_to(x.value::text,'UTF8')),'hex')) and value->>'spoiler'='false' and value->>'category' in ('theme','trope','genre','tone','reader_promise') limit 32) f) as facts
  from public.books b join public.book_intelligence bi on bi.author_id=b.author_id and bi.manuscript_id=b.active_manuscript_id
  where b.author_id=a and b.data_origin<>'demo' and private.manuscript_permission_valid(a,b.active_manuscript_id) order by b.title limit 100
 ) q;
 return result;
end $$;

-- New Ads reports use only permitted, undisputed book observations.
create or replace function private.ads_worker(p_action text,p_id uuid,p_run text,p_payload jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
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
    (select jsonb_agg(f) from (select x.value as f from public.book_intelligence bi cross join lateral jsonb_array_elements(bi.profile->'facts') with ordinality x(value,ordinality) where bi.manuscript_id=b.active_manuscript_id and bi.author_id=j.author_id and private.manuscript_permission_valid(j.author_id,bi.manuscript_id) and x.value->>'spoiler'='false' and x.value->>'category' in ('theme','trope','genre','tone','reader_promise') and not exists(select 1 from public.book_fact_reviews review where review.author_id=j.author_id and review.manuscript_id=bi.manuscript_id and review.fact_index=x.ordinality-1 and review.judgement in ('needs_check','do_not_use') and review.source_hash=encode(sha256(convert_to(x.value::text,'UTF8')),'hex')) limit 6) ff) as facts
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
revoke all on function private.ads_worker(text,uuid,text,jsonb,text) from public,authenticated;
grant execute on function private.ads_worker(text,uuid,text,jsonb,text) to anon;
