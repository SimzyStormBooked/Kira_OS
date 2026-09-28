-- An editor can revoke a manuscript version's use immediately. This is a
-- privacy action, not physical erasure: stored bytes and historical snapshots
-- remain for a separately audited deletion workflow.
alter table public.manuscripts drop constraint if exists manuscripts_status_check;
alter table public.manuscripts add constraint manuscripts_status_check
 check(status in ('uploading','queued','processing','ready','failed','withdrawn'));
alter table public.manuscripts add column withdrawn_at timestamptz;
alter table public.manuscripts add column withdrawn_by uuid references auth.users(id);

create or replace function private.manuscript_permission_valid(p_author_id uuid,p_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.manuscripts m
    join public.content_assets a on a.author_id=m.author_id and a.id=m.asset_id and a.book_id=m.book_id and a.source_id=m.source_id
    join public.sources s on s.author_id=m.author_id and s.id=m.source_id
    where m.author_id=p_author_id and m.id=p_id and m.status<>'withdrawn'
      and a.rights_status='approved' and a.read_only and a.storage_path=m.storage_path
      and s.source_type='document' and s.metadata->>'permission_scope'='private_reference_analysis'
      and s.metadata->>'manuscript_id'=m.id::text and s.metadata->>'book_id'=m.book_id::text and s.metadata->>'content_hash'=m.content_hash);
$$;

create function private.manuscript_reference_visible(a uuid,m uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_author(a) and exists(select 1 from public.manuscripts where author_id=a and id=m and status<>'withdrawn');
$$;
revoke all on function private.manuscript_reference_visible(uuid,uuid) from public,anon;
grant execute on function private.manuscript_reference_visible(uuid,uuid) to authenticated;
create policy withdrawn_chunks_guard on public.knowledge_chunks as restrictive for select to authenticated
 using(manuscript_id is null or private.manuscript_reference_visible(author_id,manuscript_id));
create policy withdrawn_intelligence_guard on public.book_intelligence as restrictive for select to authenticated
 using(private.manuscript_reference_visible(author_id,manuscript_id));
create policy withdrawn_character_guard on public.book_characters as restrictive for select to authenticated
 using(private.manuscript_reference_visible(author_id,manuscript_id));
create policy withdrawn_batches_guard on public.manuscript_batches as restrictive for select to authenticated
 using(private.manuscript_reference_visible(author_id,manuscript_id));
create policy withdrawn_sources_guard on public.sources as restrictive for select to authenticated
 using(not exists(select 1 from public.manuscripts m where m.author_id=public.sources.author_id and m.source_id=public.sources.id and m.status='withdrawn'));
create policy withdrawn_assets_guard on public.content_assets as restrictive for select to authenticated
 using(not exists(select 1 from public.manuscripts m where m.author_id=public.content_assets.author_id and m.asset_id=public.content_assets.id and m.status='withdrawn'));
create policy withdrawn_character_names_guard on public.characters as restrictive for select to authenticated
 using(not exists(select 1 from public.manuscripts m where m.author_id=public.characters.author_id and m.source_id=public.characters.source_id and m.status='withdrawn'));

create function private.manuscript_withdraw(a uuid,m_id uuid,p_key text) returns public.manuscripts
 language plpgsql security definer set search_path='' as $$
declare m public.manuscripts;fallback uuid;begin
 perform private.manuscript_writer(a,p_key);
 perform 1 from public.authors where id=a for update;
 select * into m from public.manuscripts where author_id=a and id=m_id for update;
 if not found then raise exception 'Manuscript unavailable' using errcode='P0002';end if;
 if m.status='withdrawn' then return m;end if;
 -- No in-flight batch can commit after the asset permission changes. The
 -- worker rechecks that permission while holding the manuscript row lock.
 update public.manuscript_reading_jobs set state='paused',updated_at=now()
  where manuscript_id=m_id and state in ('queued','running');
 update public.content_assets set rights_status='restricted' where author_id=a and id=m.asset_id;
 update public.manuscripts set status='withdrawn',withdrawn_at=now(),withdrawn_by=auth.uid(),error_code=null
  where id=m_id returning * into m;
 select prior.id into fallback from public.manuscripts prior
  join public.content_assets asset on asset.id=prior.asset_id and asset.author_id=prior.author_id
  where prior.author_id=a and prior.book_id=m.book_id and prior.id<>m_id and prior.status='ready'
   and asset.rights_status='approved' order by prior.version desc limit 1;
 update public.books set active_manuscript_id=fallback where author_id=a and id=m.book_id and active_manuscript_id=m_id;
 return m;
end $$;
create function public.manuscript_withdraw(p_author_id uuid,p_id uuid,p_recording_key text) returns public.manuscripts
 language sql security invoker set search_path='' as $$ select private.manuscript_withdraw(p_author_id,p_id,p_recording_key); $$;
revoke all on function private.manuscript_withdraw(uuid,uuid,text),public.manuscript_withdraw(uuid,uuid,text) from public,anon;
grant execute on function private.manuscript_withdraw(uuid,uuid,text),public.manuscript_withdraw(uuid,uuid,text) to authenticated;

-- Storage remains private and its no-delete guard stays in place. A withdrawn
-- version cannot mint new download links or be read through authenticated
-- Storage requests; links minted earlier can live for up to their 60s TTL.
drop policy if exists kira_manuscript_read_guard on storage.objects;
create policy kira_manuscript_read_guard on storage.objects as restrictive for select to authenticated using(
 bucket_id<>'kira-manuscripts' or exists(select 1 from public.manuscripts m
  where m.storage_path=name and m.status<>'withdrawn' and private.can_read_author(m.author_id)));
