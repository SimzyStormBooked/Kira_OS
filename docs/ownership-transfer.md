# Transferring workspace ownership to Cassy

Resolves decision D1 (and, as a side effect, D3) from `docs/ux-review/spec.md`: Cassy becomes the workspace Owner, so she approves and activates her own marketing plans and can see who else has access. Michael stays on as Editor.

**This has not been run.** It changes live data in the production Supabase project and needs credentials this repository does not hold. Run it yourself in the Supabase SQL editor, or hand it to a session that has access.

## Why it has to be one transaction

Ownership is a single column, `public.authors.owner_user_id`. The app's own `workspace_access_grant` RPC refuses to add the current owner as a member, and it requires the caller to still be the owner. So there is no order of ordinary app actions that ends with Cassy as Owner and Michael as Editor:

- Grant Michael Editor first: refused, he is the owner.
- Transfer first, then grant: the moment ownership moves, Michael has no member row and no access, so he cannot run the grant.

Doing both writes in one transaction avoids a window where either person is locked out.

## Before you start

Find both user IDs and confirm the current state:

```sql
select id, email from auth.users where email in ('michael@getanswerednow.ai', '<cassy-email>');

select a.id as author_id, a.name, a.owner_user_id, u.email as current_owner
from public.authors a join auth.users u on u.id = a.owner_user_id;

select m.user_id, mu.email, m.role
from public.author_members m join auth.users mu on mu.id = m.user_id;
```

Expected today: the author row is owned by Michael, and Cassy holds an `author_members` row with role `editor`.

## The transfer

Substitute the three UUIDs, then run the whole block. It either completes or leaves everything as it was.

```sql
begin;

-- 1. Michael keeps working access as an Editor, added before ownership moves.
insert into public.author_members (author_id, user_id, role)
values ('<author_id>', '<michael_user_id>', 'editor')
on conflict (author_id, user_id) do update set role = 'editor';

-- 2. Ownership moves to Cassy.
update public.authors
   set owner_user_id = '<cassy_user_id>', updated_at = now()
 where id = '<author_id>' and owner_user_id = '<michael_user_id>';

-- 3. Her old Editor row is redundant now that she owns the workspace.
delete from public.author_members
 where author_id = '<author_id>' and user_id = '<cassy_user_id>';

commit;
```

The `where owner_user_id = '<michael_user_id>'` guard means the update silently affects zero rows if someone already transferred it. Check the row count before committing; if step 2 reports `UPDATE 0`, roll back and re-read the current state.

## Verify

```sql
select u.email as owner from public.authors a
  join auth.users u on u.id = a.owner_user_id where a.id = '<author_id>';
select mu.email, m.role from public.author_members m
  join auth.users mu on mu.id = m.user_id where m.author_id = '<author_id>';
```

Owner should be Cassy; members should list Michael as `editor`.

Then in the app, signed in as Cassy: Settings shows "Your role: Owner", Workspace access shows Michael, and a marketing plan in review shows the owner review card with Approve and Activate rather than the waiting notice.

## Rolling back

Swap the two user IDs in the same block. Nothing else in the schema stores ownership, and no data is deleted by the transfer beyond Cassy's now-redundant member row, which the rollback recreates.

## What this changes in the product

- Cassy approves and activates her own plans. The "Waiting on owner review" card stops appearing for her; the review step becomes her own second look before dated tasks go live.
- She sees the workspace roster.
- Michael keeps everything an Editor can do: briefs, decisions, manuscripts, plans. He loses access management and Meta authorization, both of which are owner-only. If he needs to finish Meta setup, do that before the transfer or transfer back temporarily.

## Still worth doing in code

Ownership makes the roster visible to Cassy specifically. It does not help any future Editor or Viewer, who still cannot see who shares the workspace before uploading a manuscript. `supabase/migrations/202609270001_workspace_roster_visibility.sql` relaxes the listing RPC from owner-only to any member, leaving all three mutation RPCs owner-only. Apply it with the same deployment as the transfer if you want both.
