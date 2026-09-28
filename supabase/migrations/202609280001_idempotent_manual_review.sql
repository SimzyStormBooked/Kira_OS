-- A lost response must not cost her a duplicate brief.
--
-- create_manual_review previously minted its own id, so a commit whose response
-- never reached the browser looked identical to a failure. The retry the UI
-- invites ("Your text is still here; please try again") then wrote a second
-- brief she had to find and clean up.
--
-- The client now supplies the request id and reuses it for as long as the title
-- and draft are unchanged, which makes the save idempotent: the retry returns
-- the brief that already exists instead of creating another.
--
-- p_id is optional so existing callers keep working. Authorization, validation
-- and the evidence snapshot are unchanged.
-- Replace rather than overload: a 4th defaulted argument alongside the old
-- 3-argument function makes a 3-argument call ambiguous.
drop function if exists public.create_manual_review(uuid, text, text);
create function public.create_manual_review(p_author_id uuid, p_title text, p_draft text, p_id uuid default null)
returns public.approval_requests language plpgsql security invoker set search_path = '' as $$
declare source_id uuid; request public.approval_requests; submitted_at timestamptz := now();
begin
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 then
    raise exception 'Title must contain between 1 and 200 characters' using errcode = '22023';
  end if;
  if p_draft is null or length(trim(p_draft)) not between 1 and 10000 then
    raise exception 'Draft must contain between 1 and 10000 characters' using errcode = '22023';
  end if;
  if p_id is not null then
    -- Hold the lock for this transaction so two retries in flight at once
    -- cannot both miss the row below and both insert. The second waits here,
    -- then returns the brief the first one wrote.
    perform pg_advisory_xact_lock(hashtextextended(p_author_id::text || ':' || p_id::text, 0));
    -- RLS scopes this read to her own workspace, so a brief that exists under
    -- another tenant is never returned; it surfaces as the unique violation below.
    select * into request from public.approval_requests
      where id = p_id and author_id = p_author_id;
    if found then return request; end if;
  end if;
  insert into public.sources(author_id,name,source_type,retrieved_at,metadata,data_origin)
    values(p_author_id,'Member-supplied business brief','human_feedback',submitted_at,
      jsonb_build_object('submitted_by',auth.uid(),'purpose','manual_business_review'),'manual')
    returning id into source_id;
  begin
    insert into public.approval_requests(id,author_id,type,title,description,draft,evidence,data_origin)
      values(coalesce(p_id,gen_random_uuid()),p_author_id,'campaign',trim(p_title),
        'A member-supplied business brief for Cassandra to review. No external action is authorized.',trim(p_draft),
        jsonb_build_array(jsonb_build_object(
          'id',gen_random_uuid(),'source_id',source_id,'source','Member-supplied business brief',
          'source_type','human_feedback','retrieved_at',submitted_at,'excerpt_or_metric',trim(p_draft),
          'metadata',jsonb_build_object('submitted_by',auth.uid(),'purpose','manual_business_review'),
          'data_origin','manual')),'manual')
      returning * into request;
  exception when unique_violation then
    raise exception 'That brief id is already in use. Reload before saving again.' using errcode = '22023';
  end;
  return request;
end;
$$;

revoke all on function public.create_manual_review(uuid,text,text,uuid) from public, anon;
grant execute on function public.create_manual_review(uuid,text,text,uuid) to authenticated;
