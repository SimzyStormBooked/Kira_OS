-- Read-only knowledge foundation. No embedding job or retrieval feature runs in Phase One.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated;
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.authors(id) on delete cascade,
  source_id uuid not null, asset_id uuid, chunk_index integer not null check(chunk_index >= 0),
  reference_text text not null, content_hash text not null, embedding extensions.vector(1536), embedding_model text,
  read_only boolean not null default true check(read_only), data_origin public.data_origin not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(author_id,source_id,chunk_index),
  foreign key(author_id,source_id) references public.sources(author_id,id),
  foreign key(author_id,asset_id) references public.content_assets(author_id,id),
  check(embedding is null or embedding_model is not null)
);
-- No ANN index until corpus size and selected embedding model justify one.
alter table public.knowledge_chunks enable row level security;
create policy chunks_read on public.knowledge_chunks for select to authenticated using(private.can_read_author(author_id));
create policy chunks_insert on public.knowledge_chunks for insert to authenticated with check(private.can_edit_author(author_id));
create policy chunks_delete on public.knowledge_chunks for delete to authenticated using(private.can_edit_author(author_id));
create index chunks_author_source_idx on public.knowledge_chunks(author_id,source_id);
revoke all on public.knowledge_chunks from anon;
grant select, insert, delete on public.knowledge_chunks to authenticated;
