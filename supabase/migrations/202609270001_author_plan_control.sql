-- Zero-cost author-created plans may be approved and scheduled by their creator.
-- The extracted proposal must also have no paid recommendation. This never runs ads,
-- publishes a post, or authorizes an external purchase.
create function private.strategy_author_self_review_allowed(a uuid,p_id uuid,p_revision uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_edit_author(a) and exists(
  select 1 from public.strategy_plans p
  join public.strategy_revisions r on r.author_id=p.author_id and r.plan_id=p.id and r.id=p_revision
  where p.author_id=a and p.id=p_id and p.created_by=auth.uid()
    and p.latest_revision_id=r.id and p.input->'budgetUsd'='0'::jsonb
    and r.status='complete' and jsonb_typeof(r.output->'recommendations')='array'
    and not exists(select 1 from jsonb_array_elements(r.output->'recommendations') rec
      where jsonb_typeof(rec->'estimated_cost_usd') is distinct from 'number'
        or rec->'estimated_cost_usd'<>'0'::jsonb)
 );
$$;
revoke all on function private.strategy_author_self_review_allowed(uuid,uuid,uuid) from public,anon;
grant execute on function private.strategy_author_self_review_allowed(uuid,uuid,uuid) to authenticated;

create or replace function private.strategy_review_plan(a uuid,p_id uuid,p_expected integer,p_decision text,p_feedback text) returns public.strategy_plans language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;r public.strategy_revisions;begin
 select * into p from public.strategy_plans where author_id=a and id=p_id for update;
 if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
 if p.version is distinct from p_expected then raise exception 'Plan changed' using errcode='40001';end if;
 if p.status not in ('needs_review','approved') or p_decision is null or p_decision not in ('approved','changes_requested') or p_feedback is null or length(p_feedback)>4000 or (p_decision='changes_requested' and length(trim(p_feedback))=0) then raise exception 'Invalid review' using errcode='22023';end if;
 if p_decision='approved' and p.input->>'anchorDate' is null then raise exception 'Set a start or release date before approval' using errcode='22023';end if;
 select * into r from public.strategy_revisions where id=p.latest_revision_id and author_id=a;
 if r.id is null or r.status<>'complete' or not private.strategy_snapshot_allowed(a,r.input_snapshot) then raise exception 'Plan evidence unavailable' using errcode='42501';end if;
 if not private.owns_author(a) and not (p_decision='approved' and private.strategy_author_self_review_allowed(a,p.id,r.id)) then raise exception 'Owner review required for this plan' using errcode='42501';end if;
 insert into public.strategy_reviews(author_id,plan_id,revision_id,decision,feedback,reviewed_by) values(a,p.id,r.id,p_decision,p_feedback,auth.uid());
 update public.strategy_plans set status=p_decision,approved_revision_id=case when p_decision='approved' then r.id else null end,version=version+1,updated_at=now() where id=p.id returning * into p;return p;
end $$;

create or replace function private.strategy_activate_plan(a uuid,p_id uuid,p_expected integer) returns public.strategy_plans language plpgsql security definer set search_path='' as $$
declare p public.strategy_plans;r public.strategy_revisions;phase jsonb;task jsonb;ordinal integer:=0;campaign uuid;anchor date;begin
 select * into p from public.strategy_plans where author_id=a and id=p_id for update;
 if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
 if p.status in ('active','completed') and p.active_revision_id=p.approved_revision_id then return p;end if;
 if p.version is distinct from p_expected then raise exception 'Plan changed' using errcode='40001';end if;
 if p.status<>'approved' or p.approved_revision_id is distinct from p.latest_revision_id or p.input->>'anchorDate' is null then raise exception 'Approve a plan with an anchor date first' using errcode='22023';end if;
 select * into r from public.strategy_revisions where id=p.approved_revision_id and author_id=a;
 if r.id is null or r.status<>'complete' or not private.strategy_snapshot_allowed(a,r.input_snapshot) then raise exception 'Plan evidence unavailable' using errcode='42501';end if;
 if not private.owns_author(a) and not (private.strategy_author_self_review_allowed(a,p.id,r.id) and exists(select 1 from public.strategy_reviews where author_id=a and plan_id=p.id and revision_id=r.id and decision='approved' and reviewed_by=auth.uid())) then raise exception 'Owner activation required for this plan' using errcode='42501';end if;
 anchor:=(p.input->>'anchorDate')::date;
 insert into public.campaigns(author_id,name,objective,status,data_origin) values(a,p.title,p.input->>'intent','reviewed','manual') returning id into campaign;
 for phase in select value from jsonb_array_elements(r.output->'phases') loop
  for task in select value from jsonb_array_elements(phase->'tasks') loop
   ordinal:=ordinal+1;insert into public.strategy_tasks(author_id,plan_id,revision_id,campaign_id,phase,ordinal,due_date,definition) values(a,p.id,r.id,campaign,(phase->>'window')::integer,ordinal,anchor+(task->>'day_offset')::integer,task);
  end loop;
 end loop;
 update public.strategy_plans set status='active',active_revision_id=r.id,campaign_id=campaign,version=version+1,updated_at=now() where id=p.id returning * into p;return p;
end $$;

