-- Read-only retrieval: caller RLS remains authoritative, including viewer access.
alter table public.workspace_generations add column search_document tsvector
  generated always as (
    to_tsvector('english'::regconfig, prompt) ||
    jsonb_to_tsvector('english'::regconfig, coalesce(result, '{}'::jsonb), '["string"]'::jsonb)
  ) stored;
create index workspace_generations_search_idx on public.workspace_generations using gin(search_document);
create index workspace_generations_history_idx on public.workspace_generations(author_id, created_at desc, id desc);

create function public.workspace_generation_history(
  p_author_id uuid, p_query text default '', p_before_created_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 26, p_completed_only boolean default false
) returns setof public.workspace_generations
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_author_id is null or p_query is null or length(p_query) > 200
    or p_limit is null or p_limit < 1 or p_limit > 51
    or (p_before_created_at is null) <> (p_before_id is null) or p_completed_only is null then
    raise exception 'Invalid history request' using errcode = '22023';
  end if;
  return query select g.* from public.workspace_generations g
    where g.author_id = p_author_id
      and (not p_completed_only or g.status = 'complete')
      and (btrim(p_query) = '' or g.search_document @@ plainto_tsquery('english'::regconfig, p_query))
      and (p_before_created_at is null or (g.created_at, g.id) < (p_before_created_at, p_before_id))
    order by g.created_at desc, g.id desc limit p_limit;
end;
$$;
revoke all on function public.workspace_generation_history(uuid,text,timestamptz,uuid,integer,boolean) from public, anon;
grant execute on function public.workspace_generation_history(uuid,text,timestamptz,uuid,integer,boolean) to authenticated;
