-- Author-selected home showcase: pin up to 6 characters to appear on the home page.
-- Extends character_profile_save from 202609260002_character_profile_editing.sql with one
-- more allowed key rather than adding a parallel RPC; the version-check, ownership, and
-- column-grant story stays exactly as it was for every existing caller.
alter table public.character_profiles add column home_showcase_pinned_at timestamptz;
create index character_profiles_home_showcase_idx on public.character_profiles(author_id,home_showcase_pinned_at)
  where home_showcase_pinned_at is not null;
-- character_profile_save is security invoker, so the caller's own grants must cover this
-- column; select is already table-wide from 202609210001_character_studio.sql.
grant update(home_showcase_pinned_at) on public.character_profiles to authenticated;

create or replace function public.character_profile_save(p_author_id uuid,p_id uuid,p_expected_version integer,p_changes jsonb)
returns public.character_profiles language plpgsql security invoker set search_path='' as $$
declare result public.character_profiles; alias_value text; begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Only an owner or editor can change a character.' using errcode='42501'; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object'
    or exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('display_name','summary','aliases','primary_portrait_id','home_showcase_pinned'))
    or (p_changes ? 'display_name' and (jsonb_typeof(p_changes->'display_name')<>'string' or length(trim(p_changes->>'display_name')) not between 1 and 120))
    or (p_changes ? 'summary' and (jsonb_typeof(p_changes->'summary') not in ('null','string') or length(p_changes->>'summary')>2000))
    or (p_changes ? 'aliases' and (jsonb_typeof(p_changes->'aliases')<>'array' or jsonb_array_length(p_changes->'aliases')>8))
    or (p_changes ? 'home_showcase_pinned' and jsonb_typeof(p_changes->'home_showcase_pinned')<>'boolean')
    then raise exception 'Invalid character details.' using errcode='22023'; end if;
  if p_changes ? 'aliases' then
    if exists(select 1 from jsonb_array_elements(p_changes->'aliases') a where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 120) then
      raise exception 'Invalid character aliases.' using errcode='22023'; end if;
  end if;
  if p_id is null then
    if not (p_changes ? 'display_name') then raise exception 'A name is required.' using errcode='22023'; end if;
    insert into public.character_profiles(author_id,display_name,summary)
      values(p_author_id,trim(p_changes->>'display_name'),p_changes->>'summary') returning * into result;
  else
    select * into result from public.character_profiles where author_id=p_author_id and id=p_id for update;
    if not found then raise exception 'Character unavailable.' using errcode='P0002'; end if;
    if p_expected_version is null or result.version<>p_expected_version then raise exception 'Character changed.' using errcode='40001'; end if;
    if p_changes ? 'primary_portrait_id' and p_changes->>'primary_portrait_id' is not null then
      perform 1 from public.character_portraits where author_id=p_author_id and profile_id=p_id and id=(p_changes->>'primary_portrait_id')::uuid and status='ready';
      if not found then raise exception 'Portrait unavailable.' using errcode='22023'; end if;
    end if;
    -- A showcase celebrates a few chosen characters, not the whole cast: capped at 6, and
    -- only checked when actually pinning (unpinning, or re-pinning an already-pinned
    -- profile, never needs room).
    if p_changes ? 'home_showcase_pinned' and (p_changes->>'home_showcase_pinned')::boolean and result.home_showcase_pinned_at is null then
      if (select count(*) from public.character_profiles where author_id=p_author_id and home_showcase_pinned_at is not null)>=6 then
        -- A distinct code from ordinary validation failures, so the app can show this
        -- exact, actionable text instead of a generic "check the fields" message.
        raise exception 'Up to 6 characters can be shown on your home page. Unpin one first.' using errcode='23514';
      end if;
    end if;
    update public.character_profiles set
      display_name=case when p_changes ? 'display_name' then trim(p_changes->>'display_name') else display_name end,
      summary=case when p_changes ? 'summary' then p_changes->>'summary' else summary end,
      primary_portrait_id=case when p_changes ? 'primary_portrait_id' then (p_changes->>'primary_portrait_id')::uuid else primary_portrait_id end,
      -- Re-pinning an already-pinned character moves it to the end of the showcase order
      -- (pinned_at advances); pinning it again with the same intent is otherwise a no-op.
      home_showcase_pinned_at=case when not (p_changes ? 'home_showcase_pinned') then home_showcase_pinned_at
        when (p_changes->>'home_showcase_pinned')::boolean then now() else null end
      where author_id=p_author_id and id=p_id returning * into result;
  end if;
  if p_changes ? 'aliases' then
    delete from public.character_profile_aliases where author_id=p_author_id and profile_id=result.id;
    for alias_value in select jsonb_array_elements_text(p_changes->'aliases') loop
      insert into public.character_profile_aliases(author_id,profile_id,alias) values(p_author_id,result.id,trim(alias_value));
    end loop;
  end if;
  return result;
end $$;
revoke all on function public.character_profile_save(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.character_profile_save(uuid,uuid,integer,jsonb) to authenticated;
