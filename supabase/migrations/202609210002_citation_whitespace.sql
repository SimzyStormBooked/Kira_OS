-- Forward-only correction: bound a citation by the CONTENT it quotes, not by the raw
-- length of the source's own whitespace.
-- CREATE OR REPLACE retains the function signature and its execute grants.
--
-- Extracted PDF text keeps the page's line breaks and column padding. In the current
-- production manuscript 601 of 602 stored passages contain a newline, and whitespace
-- inflates a quoted span by up to 4.8x. The application now stores the verbatim span of
-- the passage a citation refers to, so a quote the model kept inside its 300-character
-- limit can still exceed 300 raw characters: measured against the real manuscript, 173 of
-- 2392 spans do. That is why the raw limit rises while the content limit stays at 300.
--
-- The whitespace class here is written out rather than left as \s: PostgreSQL's \s does not
-- match U+00A0, U+1680, U+2007, U+202F or U+FEFF, while JavaScript's does. If the two sides
-- disagreed about what a space is, the application would accept a citation the database then
-- rejected, failing the whole batch — the very defect this migration exists to remove.
--
-- The exact-substring requirement is deliberately untouched. A stored quote must still
-- appear literally in the stored passage, so this loosens how much whitespace a citation
-- may carry and nothing about which words it may claim.
create or replace function private.valid_manuscript_citations(p_author_id uuid,p_manuscript_id uuid,p_chunk_ids uuid[],citations jsonb)
returns boolean language plpgsql stable set search_path='' as $$ declare c jsonb; begin
  if citations is null or jsonb_typeof(citations) is distinct from 'array' or jsonb_array_length(citations) not between 1 and 4 then return false; end if;
  for c in select value from jsonb_array_elements(citations) loop
    if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>2 or not(c ?& array['chunk_id','quote'])
      or jsonb_typeof(c->'chunk_id') is distinct from 'string' or jsonb_typeof(c->'quote') is distinct from 'string'
      or length(trim(c->>'quote'))<1 or length(c->>'quote')>2000
      or length(btrim(regexp_replace(c->>'quote','[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',' ','g')))>300 then return false; end if;
    if not exists(select 1 from public.knowledge_chunks where author_id=p_author_id and manuscript_id=p_manuscript_id and id=(c->>'chunk_id')::uuid and id=any(p_chunk_ids) and strpos(reference_text,c->>'quote')>0) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function private.valid_manuscript_citations(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;
comment on function private.valid_manuscript_citations(uuid,uuid,uuid[],jsonb) is
  'A citation must quote at most 300 characters of content and appear literally in a passage of its own batch. Raw length may reach 2000 because the source''s line breaks and padding are stored with it.';
