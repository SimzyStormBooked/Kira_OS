-- The relationship map: an explicit, author-written connection between two of the
-- author's own character profiles. Manuscript extraction already produces a free-text
-- "relationships" field per character observation, but that stays exactly what it is —
-- an unreviewed guess about one book's text, tied to a book-scoped character. A
-- relationship here is a first-person author assertion between two workspace-scoped
-- identities, the same authority character_notes already gives an author-confirmed note,
-- and it never rewrites or references that extracted text.
create table public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  profile_id uuid not null,
  related_profile_id uuid not null,
  -- Read as a sentence: "<profile> <label> <related_profile>". No reverse label is
  -- generated, so a relationship is only ever stated the way its author wrote it — never
  -- guessed from the other direction.
  label text not null check(length(trim(label)) between 1 and 120),
  note text check(note is null or length(note)<=600),
  book_id uuid,
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  data_origin public.data_origin not null default 'manual' check(data_origin='manual'),
  unique(author_id,id),
  check(profile_id<>related_profile_id),
  foreign key(author_id,profile_id) references public.character_profiles(author_id,id) on delete cascade,
  foreign key(author_id,related_profile_id) references public.character_profiles(author_id,id) on delete cascade,
  foreign key(author_id,book_id) references public.books(author_id,id)
);
alter table public.character_relationships enable row level security;
create policy character_relationships_read on public.character_relationships for select to authenticated
  using(private.can_read_author(author_id));
-- related_profile_id's tenant match is enforced by its own composite foreign key above,
-- the same way character_profile_links relies on foreign keys rather than an exists check.
create policy character_relationships_add on public.character_relationships for insert to authenticated
  with check(private.can_edit_author(author_id) and created_by=(select auth.uid()));
create policy character_relationships_edit on public.character_relationships for update to authenticated
  using(private.can_edit_author(author_id)) with check(private.can_edit_author(author_id));
create policy character_relationships_remove on public.character_relationships for delete to authenticated
  using(private.can_edit_author(author_id));
revoke all on public.character_relationships from public,anon,authenticated;
grant select on public.character_relationships to authenticated;
grant insert(author_id,profile_id,related_profile_id,label,note,book_id) on public.character_relationships to authenticated;
grant update(label,note,book_id) on public.character_relationships to authenticated;
grant delete on public.character_relationships to authenticated;
create index character_relationships_author_idx on public.character_relationships(author_id);
create index character_relationships_profile_idx on public.character_relationships(author_id,profile_id);
create index character_relationships_related_idx on public.character_relationships(author_id,related_profile_id);
-- Advances updated_at and version the way every other Character Studio edit does.
create trigger character_relationships_touch before update on public.character_relationships
  for each row execute function private.character_studio_touch();
comment on table public.character_relationships is
  'A directed, author-written connection between two of the author''s own character profiles: "<profile> <label> <related_profile>". No inverse is generated or implied; extraction-owned relationship text in book_characters is never rewritten or referenced here.';
