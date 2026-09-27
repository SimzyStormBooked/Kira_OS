-- Forward-only correction: Raven's plan citations and context references are resolved the way
-- manuscript citations now are. CREATE OR REPLACE retains each signature and its grants.
--
-- Manuscript citations are now stored as the verbatim span of their passage, line breaks and
-- all, and that text flows on into the evidence Raven reads for Marketing Plans and Ask Raven.
-- Both checked a quote against its evidence with an exact substring test and a raw length cap,
-- so a book read after that change would have had Raven's re-quotes of it rejected. The
-- application now resolves each quote against ONE source ignoring only whitespace runs and
-- stores that source's own text, so the exact tests below stay exact and keep their meaning.
--
-- Ask Raven's reference text joined the question and every evidence item with a newline, so a
-- quote running from the end of one source into the start of the next matched text neither
-- contained. Sources are now joined around U+001E, which the manuscript parser removes from
-- every format and which is not whitespace, so tolerant matching can never bridge it and a
-- quote containing it is refused. Every existing answer was checked before this change: all 20
-- stored context references sit inside a single source.
--
-- A span containing "Supporting passage:" crosses from Raven's own finding into the author's
-- words, so it is refused as a quote of either.
--
-- As with manuscript citations, CONTENT is capped (300 for plans, 400 for Ask Raven, after
-- collapsing whitespace) while raw length may reach 2000, and the whitespace class is written
-- out because PostgreSQL's \s misses U+00A0, U+1680, U+2007, U+202F and U+FEFF.
--
-- Reviewed and corrected before this migration first shipped: the label refusal above applies
-- only to manuscript-derived findings, never to the member's own words (a question, a planning
-- request, review feedback), which may say "Supporting passage:" as ordinary text. A quote that
-- occurs more than once now tries every occurrence rather than only the first, so a wide first
-- match crossing a boundary cannot shadow a clean later one. The plan size cap is raised from
-- 64000 to 500000 bytes: it predates quotes stored at up to 2000 raw characters each, and a
-- maximal plan (132 citations at that length, plus its other fields) would otherwise be rejected
-- after the paid model call that produced it.

create or replace function private.studio_reference_text(prompt text,context jsonb) returns text language sql immutable set search_path='' as $$
 select prompt||E'\n\u001e\n'||coalesce((select string_agg(e->>'text',E'\n\u001e\n') from jsonb_array_elements(context->'evidence') e),'');
$$;

create or replace function private.valid_studio_output(value jsonb, prompt text) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; part jsonb; field text;
begin
  if value is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>30000
    or (select count(*) from jsonb_object_keys(value))<>6
    or not(value ?& array['kind','title','summary','options','questions','context_used'])
    or jsonb_typeof(value->'kind') is distinct from 'string' or value->>'kind' not in ('ideas','boundary') then return false; end if;
  if jsonb_typeof(value->'title') is distinct from 'string' or length(trim(value->>'title')) not between 1 and 120
    or jsonb_typeof(value->'summary') is distinct from 'string' or length(trim(value->>'summary')) not between 1 and 1600 then return false; end if;
  foreach field in array array['options','questions','context_used'] loop
    if jsonb_typeof(value->field) is distinct from 'array' then return false; end if;
  end loop;
  if jsonb_array_length(value->'options')>3 or jsonb_array_length(value->'questions')>3 or jsonb_array_length(value->'context_used')>4
    or (value->>'kind'='ideas' and jsonb_array_length(value->'options')=0)
    or (value->>'kind'='boundary' and jsonb_array_length(value->'options')<>0) then return false; end if;
  for item in select * from jsonb_array_elements(value->'context_used') loop
    if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}'))<1 or length(item#>>'{}')>2000
      or length(btrim(regexp_replace(item#>>'{}','[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',' ','g')))>400
      or strpos(item#>>'{}',E'\u001e')>0
      or strpos(prompt,item#>>'{}')=0 then return false; end if;
    -- The label crosses from a manuscript finding into its passage. Reference text joins the
    -- question first, so a reference containing the label is refused unless it sits wholly
    -- inside that first segment: the member's own words, which may say anything.
    if strpos(item#>>'{}','Supporting passage:')>0
      and strpos(split_part(prompt,E'\n\u001e\n',1),item#>>'{}')=0 then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(value->'questions') loop
    if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and 300 then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(value->'options') loop
    if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>5
      or not(item ?& array['title','idea','tradeoff','first_step','verify']) then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string' or length(trim(item->>'title')) not between 1 and 120 then return false; end if;
    foreach field in array array['idea','tradeoff','first_step'] loop
      if jsonb_typeof(item->field) is distinct from 'string' or length(trim(item->>field)) not between 1 and 600 then return false; end if;
    end loop;
    if jsonb_typeof(item->'verify') is distinct from 'array' or jsonb_array_length(item->'verify')>4 then return false; end if;
    for part in select * from jsonb_array_elements(item->'verify') loop
      if jsonb_typeof(part) is distinct from 'string' or length(trim(part#>>'{}')) not between 1 and 300 then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function private.strategy_valid_output(v jsonb,s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;cit jsonb;phase jsonb;task jsonb;g jsonb;src jsonb;off integer;k text;cap integer;begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or octet_length(v::text)>500000 or not(v ?& array['title','summary','positioning','audiences','recommendations','phases','risks','questions']) or (select count(*) from jsonb_object_keys(v))<>8 then return false;end if;
 if v->>'title' is null or v->>'summary' is null or v->>'positioning' is null or length(trim(v->>'title')) not between 1 and 160 or length(trim(v->>'summary')) not between 1 and 1600 or length(trim(v->>'positioning')) not between 1 and 1000 then return false;end if;
 if jsonb_typeof(v->'audiences') is distinct from 'array' or jsonb_array_length(v->'audiences') not between 1 and 7 or jsonb_typeof(v->'recommendations') is distinct from 'array' or jsonb_array_length(v->'recommendations') not between 1 and 8 or jsonb_typeof(v->'phases') is distinct from 'array' or jsonb_array_length(v->'phases')<>3 or (select count(distinct value->>'window') from jsonb_array_elements(v->'phases'))<>3 then return false;end if;
 foreach k in array array['risks','questions'] loop
  if jsonb_typeof(v->k) is distinct from 'array' or jsonb_array_length(v->k)>(case when k='risks' then 8 else 6 end) then return false;end if;
  for item in select value from jsonb_array_elements(v->k) loop if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and (case when k='risks' then 500 else 300 end) then return false;end if;end loop;
 end loop;
 for item in select value from jsonb_array_elements(v->'recommendations') loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>8 or not(item ?& array['title','action','rationale','channel','effort','estimated_cost_usd','goal_ids','citations']) then return false;end if;
  foreach k in array array['title','action','rationale','channel','effort'] loop
   cap:=case when k='title' then 160 when k='channel' then 80 when k='effort' then 10 else 800 end;
   if jsonb_typeof(item->k) is distinct from 'string' or length(trim(item->>k)) not between 1 and cap then return false;end if;
  end loop;
  if item->>'effort' not in ('low','medium','high') or jsonb_typeof(item->'estimated_cost_usd') is distinct from 'number' or (item->>'estimated_cost_usd')::numeric not between 0 and 1e7 then return false;end if;
 end loop;
 for item in select value from jsonb_array_elements(v->'audiences') loop
  if (select count(*) from jsonb_object_keys(item))<>3 or jsonb_typeof(item->'why') is distinct from 'string' or length(trim(item->>'why')) not between 1 and 600 then return false;end if;
  if item->>'segment' is null or not (s->'input'->'segments' ? (item->>'segment')) then return false;end if;
 end loop;
 for phase in select value from jsonb_array_elements(v->'phases') loop
  if (select count(*) from jsonb_object_keys(phase))<>4 or jsonb_typeof(phase->'label') is distinct from 'string' or length(trim(phase->>'label')) not between 1 and 120 or jsonb_typeof(phase->'focus') is distinct from 'string' or length(trim(phase->>'focus')) not between 1 and 600 then return false;end if;
  if phase->>'window' is null or (phase->>'window')::integer not in (30,60,90) or jsonb_typeof(phase->'tasks') is distinct from 'array' or jsonb_array_length(phase->'tasks') not between 1 and 6 then return false;end if;
  for task in select value from jsonb_array_elements(phase->'tasks') loop
   if (select count(*) from jsonb_object_keys(task))<>7 or not(task ?& array['title','instructions','channel','day_offset','goal_ids','success_measure','citations']) then return false;end if;
   foreach k in array array['title','instructions','channel','success_measure'] loop
    cap:=case when k='title' then 160 when k='instructions' then 1000 when k='channel' then 80 else 400 end;
    if jsonb_typeof(task->k) is distinct from 'string' or length(trim(task->>k)) not between 1 and cap then return false;end if;
   end loop;
   if jsonb_typeof(task->'day_offset') is distinct from 'number' or (task->>'day_offset')::numeric<>trunc((task->>'day_offset')::numeric) or length(trim(task->>'title')) not between 1 and 160 or length(trim(task->>'instructions')) not between 1 and 1000 then return false;end if;
   off:=(task->>'day_offset')::integer*case when s->'input'->>'mode'='before_release' then -1 else 1 end;
   if off not between (phase->>'window')::integer-29 and (phase->>'window')::integer then return false;end if;
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(v->'audiences') union all select value from jsonb_array_elements(v->'recommendations') union all select t.value from jsonb_array_elements(v->'phases') p cross join lateral jsonb_array_elements(p.value->'tasks') t loop
  if jsonb_typeof(item->'citations') is distinct from 'array' or jsonb_array_length(item->'citations') not between 1 and 4 then return false;end if;
  for cit in select value from jsonb_array_elements(item->'citations') loop
   if (select count(*) from jsonb_object_keys(cit))<>2 or jsonb_typeof(cit->'quote') is distinct from 'string' or jsonb_typeof(cit->'evidence_id') is distinct from 'string' then return false;end if;
   if cit->>'quote' is null or length(trim(cit->>'quote'))<1 or length(cit->>'quote')>2000
    or length(btrim(regexp_replace(cit->>'quote','[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',' ','g')))>300
    or strpos(cit->>'quote',E'\u001e')>0 then return false;end if;
   -- The quote must be a literal substring of the ONE evidence item it names. Only a
   -- manuscript-derived item carries a "Supporting passage:" boundary to protect; the
   -- author's own request, feedback or metadata may freely contain that phrase.
   select e into src from jsonb_array_elements(s->'evidence') e where e->>'id'=cit->>'evidence_id' and position(cit->>'quote' in e->>'text')>0 limit 1;
   if src is null or (src->>'kind'='manuscript' and strpos(cit->>'quote','Supporting passage:')>0) then return false;end if;
  end loop;
  if item ? 'goal_ids' then
   if jsonb_typeof(item->'goal_ids') is distinct from 'array' or jsonb_array_length(item->'goal_ids')>8 then return false;end if;
   for g in select value from jsonb_array_elements(item->'goal_ids') loop if not exists(select 1 from jsonb_array_elements(s->'input'->'goals') goal where goal->>'id'=g#>>'{}') then return false;end if;end loop;
  end if;
 end loop;return true;
exception when others then return false;
end $$;

-- workspace_generations checks every stored answer against these two functions. Postgres does
-- not recheck existing rows when a function changes, but a later update would, so refuse to
-- apply if any stored answer would no longer pass.
do $$ begin
  if exists(select 1 from public.workspace_generations where result is not null
    and not private.valid_studio_output(result,private.studio_reference_text(prompt,knowledge_context))) then
    raise exception 'A stored Ask Raven answer would fail the new reference check' using errcode='23514';
  end if;
end $$;
