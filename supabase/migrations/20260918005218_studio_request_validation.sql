-- Forward-only correction: reject invalid inputs before the existing-ID branch.
-- CREATE OR REPLACE retains the function signature and its execute grants.
create or replace function private.workspace_generation_begin(p_author_id uuid,p_id uuid,p_job text,p_prompt text,p_recording_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.workspace_generations; created public.workspace_generations; attempts integer;
begin
  perform private.assert_studio_recording_key(p_recording_key);
  if auth.uid() is null or not private.can_edit_author(p_author_id) then
    raise exception 'Only an owner or editor can ask Raven.' using errcode='42501';
  end if;
  if p_id is null or p_job is null or p_job not in ('brainstorm','agent-design','learning') or p_prompt is null or length(trim(p_prompt)) not between 10 and 6000 then
    raise exception 'Check the request fields.' using errcode='22023';
  end if;
  perform 1 from public.authors where id=p_author_id for update;
  select * into existing from public.workspace_generations where id=p_id;
  if found then
    if existing.author_id is distinct from p_author_id or existing.created_by is distinct from auth.uid()
      or existing.job is distinct from p_job or existing.prompt is distinct from trim(p_prompt) then
      raise exception 'This request ID has already been used.' using errcode='40001';
    end if;
    return jsonb_build_object('created',false,'generation',to_jsonb(existing));
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
