-- Add optional source-backed character categories; preserve existing readings.
create or replace function private.valid_manuscript_result(p_author_id uuid,p_manuscript_id uuid,p_chunk_ids uuid[],value jsonb)
returns boolean language plpgsql stable set search_path='' as $$ declare item jsonb; part jsonb; field text; maxlen integer; begin
  if value is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>100000 or (select count(*) from jsonb_object_keys(value))<>2
    or not(value ?& array['facts','characters']) or jsonb_typeof(value->'facts') is distinct from 'array' or jsonb_typeof(value->'characters') is distinct from 'array'
    or jsonb_array_length(value->'facts')>16 or jsonb_array_length(value->'characters')>8 then return false; end if;
  for item in select * from jsonb_array_elements(value->'facts') loop
    if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>5 or not(item ?& array['category','statement','kind','spoiler','citations'])
      or jsonb_typeof(item->'category') is distinct from 'string' or item->>'category' not in ('genre','synopsis','theme','trope','tone','setting','plot','reader_promise','content','marketing_hook','comparable')
      or jsonb_typeof(item->'statement') is distinct from 'string' or length(trim(item->>'statement'))<1 or length(item->>'statement')>600
      or jsonb_typeof(item->'kind') is distinct from 'string' or item->>'kind' not in ('supported','inference') or jsonb_typeof(item->'spoiler') is distinct from 'boolean'
      or not private.valid_manuscript_citations(p_author_id,p_manuscript_id,p_chunk_ids,item->'citations') then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(value->'characters') loop
    if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('name','aliases','role','description','personality','relationships','arc','marketing_description','spoiler','citations','physical_traits','backstory','archetype','character_tropes','emotional_growth'))
      or not(item ?& array['name','aliases','role','description','personality','relationships','arc','marketing_description','spoiler','citations'])
      or jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name'))<1 or length(item->>'name')>120
      or jsonb_typeof(item->'aliases') is distinct from 'array' or jsonb_array_length(item->'aliases')>8
      or jsonb_typeof(item->'spoiler') is distinct from 'boolean'
      or not private.valid_manuscript_citations(p_author_id,p_manuscript_id,p_chunk_ids,item->'citations') then return false; end if;
    for part in select * from jsonb_array_elements(item->'aliases') loop
      if jsonb_typeof(part) is distinct from 'string' or length(trim(part#>>'{}'))<1 or length(part#>>'{}')>120 then return false; end if;
    end loop;
    foreach field in array array['physical_traits','backstory','archetype','character_tropes','emotional_growth'] loop
      if item ? field and (jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>400) then return false; end if;
    end loop;
    foreach field in array array['role','description','personality','relationships','arc','marketing_description'] loop
      maxlen:=case field when 'role' then 160 when 'personality' then 400 when 'marketing_description' then 400 else 600 end;
      if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>maxlen then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function private.valid_manuscript_result(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;
