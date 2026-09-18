-- Saved shortcuts are explicitly manual. They do not authenticate accounts,
-- collect tokens, fetch private data, or alter snapshot-only social_accounts.
create function private.valid_workspace_link(platform text, url text) returns boolean
language sql immutable set search_path = '' as $$
  select length(url) <= 2048 and case platform
    when 'instagram' then url ~ '^https://www[.]instagram[.]com/[A-Za-z0-9._]{1,30}$'
    when 'facebook' then url ~ '^https://www[.]facebook[.]com/([A-Za-z0-9.]{1,100}|people/[A-Za-z0-9.-]{1,100}/[0-9]{1,30}|profile[.]php[?]id=[0-9]{1,30})$'
    when 'tiktok' then url ~ '^https://www[.]tiktok[.]com/@[A-Za-z0-9._]{1,100}$'
    when 'pinterest' then url ~ '^https://www[.]pinterest[.]com/[A-Za-z0-9_]{1,100}$'
    when 'youtube' then url ~ '^https://www[.]youtube[.]com/(@[A-Za-z0-9._-]{1,100}|(channel|c|user)/[A-Za-z0-9._-]{1,100})$'
    when 'notebooklm' then url ~ '^https://(notebooklm|notebook)[.]google[.]com/notebook/[A-Za-z0-9_-]{1,100}$'
    else false end
    and lower(url) !~ '/(accounts|login|logout|explore|direct|reel|reels|p|l[.]php|dialog|oauth|share|sharer[.]php|settings|help|search|watch)$';
$$;
revoke all on function private.valid_workspace_link(text,text) from public;
grant execute on function private.valid_workspace_link(text,text) to authenticated;

create table public.workspace_links (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  platform text not null,
  label text not null check(length(trim(label)) between 1 and 100),
  url text not null check(private.valid_workspace_link(platform,url)),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  data_origin public.data_origin not null default 'manual' check(data_origin='manual'),
  unique(author_id,platform,url)
);
alter table public.workspace_links enable row level security;
create policy workspace_links_read on public.workspace_links for select to authenticated
  using(private.can_read_author(author_id));
create policy workspace_links_add on public.workspace_links for insert to authenticated
  with check(private.can_edit_author(author_id) and created_by=(select auth.uid()));
create policy workspace_links_remove on public.workspace_links for delete to authenticated
  using(private.can_edit_author(author_id));
revoke all on public.workspace_links from public, anon, authenticated;
grant select, delete on public.workspace_links to authenticated;
grant insert(author_id,platform,label,url) on public.workspace_links to authenticated;
comment on table public.workspace_links is 'Manual profile and notebook shortcuts. A saved link is not proof of ownership, OAuth authorization, or synchronization.';
