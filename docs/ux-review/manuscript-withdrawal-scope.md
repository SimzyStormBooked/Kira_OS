# Scoping D2 as withdrawal, not deletion

Michael's question was fair: why would Cassy want to *delete* part of her own manuscript from her own workspace? She wouldn't, ordinarily. Re-reading the round-2 judge notes that produced D2, the actual complaint was never "I need the bytes gone" — it was "I can't stop people from reading a passage I regret uploading, and I can't undo a mistake." That's a visibility and control problem, not a shredding problem. This document scopes the control problem: **withdrawal**, not deletion. It is a design for review, not a diff — nothing here is implemented.

## Why withdrawal fits this schema and deletion doesn't

`202609190001_manuscript_intelligence.sql` makes manuscript rows deliberately immutable: a `guard_manuscript_reference()` trigger blocks any update/delete to `knowledge_chunks`, `content_assets`, `sources`, or `characters` rows tied to a manuscript unless it goes through the server-only `manuscript_writer` capability, and restrictive storage policies (`kira_manuscript_no_delete`, `kira_manuscript_no_overwrite`) block the file itself from ever being overwritten or removed from Storage. The table comment says it outright: *"Private, immutable manuscript versions."* That's not an oversight to route around — it's the same custody promise as the ad dashboard's "we never touch your spend" and the approval system's append-only audit trail. Building a real DELETE path would mean adding a back door to the one piece of the schema that was built specifically not to have one.

`books.active_manuscript_id` already exists as the hook this needs. It is the single pointer that decides which version's findings, search results, and cited passages are "live." Most consumers already key off it:

- `detail()` in `lib/manuscripts/repository.ts:88` only fetches `book_intelligence` when `active_manuscript_id` is set.
- `manuscript_search` (`…manuscript_intelligence.sql:421`) joins `m.id = b.active_manuscript_id` — a book with no active manuscript returns no search results at all.
- `studio_book_context` (`202609190003…sql:9,129`) and the ads dashboard (`202609200002…sql:164`) both skip a book whose `active_manuscript_id` is null or fails `manuscript_permission_valid`.
- `strategy_plans` evidence validation (`202609190002…sql:125`) does the same.

So clearing that one pointer already silences most of the surface. Two places don't go through it and need explicit closing, below.

## What "withdrawn" means

A withdrawn version:
- Stops appearing in manuscript search results, anywhere it could be reached from.
- Stops backing "What Raven learned," the studio book-context picker, plan evidence, and ads intelligence.
- Cannot be resumed or restarted for reading (no point burning AI credits reading something you just hid).
- **Stays** exactly as uploaded: same file in Storage, same `knowledge_chunks`/`content_assets`/`sources`/`characters` rows, same audit history. Nothing the immutability trigger protects is touched.
- Can be **brought back** by the person who can withdraw it, without re-uploading or re-reading. This is the thing true deletion could never offer, and it's the honest answer to "I didn't mean to do that."
- Stays downloadable. Withdrawal is about what Raven surfaces to the workspace, not about taking her own file away from her.

The honest limit, stated plainly for the UI copy: withdrawing a version does not remove the text from the system. The extracted findings and passages still exist in the database and the file still exists in Storage; a workspace owner or editor could still reach them via a database console. If a publisher contract ever requires actual erasure, that is a different, rarer request — and the existing "Request removal of this version" brief-to-Desk flow already exists for exactly that escalation and should stay, unchanged, alongside withdrawal rather than being replaced by it.

## Schema change

Add two nullable columns to `public.manuscripts`:

```sql
alter table public.manuscripts add column withdrawn_at timestamptz;
alter table public.manuscripts add column withdrawn_by uuid references auth.users(id) on delete restrict;
alter table public.manuscripts add constraint manuscripts_withdrawn_pair check ((withdrawn_at is null) = (withdrawn_by is null));
```

No change to the `guard_manuscript_reference` trigger, no change to the storage policies — this column lives on the one table in the group that was never covered by the no-delete/no-overwrite guards, because updating it isn't a reference-integrity concern the way editing a stored passage would be.

## Two new RPCs, same shape as the existing manuscript-write functions

Both go through `private.manuscript_writer(p_author_id, p_recording_key)` — the same owner-or-editor + recording-key capability that gates `manuscript_register`, `manuscript_fail_upload`, and `manuscript_finish_batch` today. That is a **default**, flagged as a decision point below, not a foregone conclusion.

**`manuscript_withdraw(p_author_id, p_id, p_recording_key)`**
- Locks the manuscript row, verifies it belongs to this author.
- Idempotent: if `withdrawn_at` is already set, return the row unchanged rather than erroring — the same lesson D4 just taught about retries costing nothing extra.
- Sets `withdrawn_at = now(), withdrawn_by = auth.uid()`.
- If `books.active_manuscript_id = p_id` for this manuscript's book, clears it to `null`. It does **not** auto-promote an older version — see the decision point below.
- Returns the updated manuscript row.

**`manuscript_reinstate(p_author_id, p_id, p_recording_key)`**
- Same capability check. Idempotent the same way (no-op if not withdrawn).
- Clears `withdrawn_at`/`withdrawn_by`.
- Restores `active_manuscript_id` only under the exact condition `manuscript_finish_batch` already uses to promote a version — `active_manuscript_id is null or the current active version's version number < this one's` — so reinstating an old, superseded version never silently overrides a newer one that's currently active. This mirrors existing logic instead of inventing new promotion rules.

## The two gaps that don't go through `active_manuscript_id`

**`repository.source()`** (`lib/manuscripts/repository.ts:120`) looks up a passage by `manuscript_id` + `chunk_id` directly, via `findManuscript()`, which checks tenant ownership but nothing else. Add `withdrawn_at` to `storedManuscriptSchema` (it comes back for free from the existing `select "*"`), and in `source()` specifically — not in `findManuscript()`, which the download route also uses and which must keep working on a withdrawn version — raise the existing "This source passage is unavailable in your workspace" 404 when `manuscript.withdrawn_at` is set.

**`private.manuscript_search`** (`…manuscript_intelligence.sql:411`) doesn't call `manuscript_permission_valid`; it inlines its own rights/scope checks in the join's `where` clause. Add `and m.withdrawn_at is null` there, next to the existing `and m.status='ready'`.

Everything else that reads manuscript knowledge — `strategy_plans`, `studio_book_context`, `background_reading`'s job-validity check, `manuscript_finish_batch` itself — already calls `private.manuscript_permission_valid(author_id, manuscript_id)`. Folding `and m.withdrawn_at is null` into that one function's `where exists(...)` closes all of them at once, including "can't resume reading a withdrawn version," from a single edit.

## UI

On the book detail page's version-history list (`components/kira/connected-book-detail.tsx:233`), alongside the existing "Download this version" and "Request removal of this version" buttons:

- **"Withdraw this version"** — a confirm dialog, honest about both what changes and what doesn't: *"Raven's findings, search results, and cited passages from this version will stop appearing anywhere in the workspace. The file and everything already extracted from it stay saved — nothing is deleted, and you can bring this version back from here."* Gated the same as the removal-request button is today (`canEdit`).
- On a withdrawn version, the button becomes **"Bring this version back"**, with the custody line showing `Withdrawn {date}`.
- If the withdrawn version was the active one, "What Raven learned" reverts to the existing empty state ("Nothing read yet") until a version is active again — either by reinstating this one or by reading another version fresh. There is currently no "make this ready version active without re-reading it" control for a *different* version; recovering to a different older version than the one just withdrawn would mean reading it again. That's an acceptable v1 limit, not something this scope tries to fix — a generic "make active" action is a reasonable separate follow-up if it turns out to matter.
- `studio-page.tsx:204` and `plans-page.tsx:98` already read `book.active_manuscript_id` to decide whether to show "metadata only" next to a book's checkbox; withdrawing the active version makes that label appear with no code change needed there.

## Open decision before any of this gets built

This is still a permissions-adjacent change — it decides who can hide reference material from the whole workspace, including whoever comes after Cassy — so per the same standard the `[Security Weaken]` denial on D3 asked for, it needs an explicit go-ahead before the migration or RPCs are written, not just before they're deployed.

The specific call to make: should withdrawal require the same "owner or editor" capability as uploading and reading (`can_edit_author`, the default above), or should it be tighter — owner-only, like access management and Meta authorization are today? Arguments either way: it's symmetric with every other manuscript-write action (upload, read, fail) to leave it at editor-level; it's also the first action that *hides* material from the rest of the workspace rather than adding to it, which is closer in spirit to the owner-only controls than to the editor-level ones. Worth a one-line answer before implementation starts.

## Tests this needs

- `tests/manuscript-database.test.ts` (or `connected-database.test.ts`, wherever the migration list lives): withdrawing the active version clears `active_manuscript_id` and leaves `knowledge_chunks`/`book_intelligence`/the storage row untouched; `manuscript_search` returns nothing for a withdrawn manuscript; reinstating the previously-active, highest version restores `active_manuscript_id`, reinstating a superseded older version does not; a viewer cannot call either RPC; calling withdraw twice, or reinstate on a version that was never withdrawn, is a no-op, not an error.
- A `lib/manuscripts/repository.ts` unit test (new or added to `tests/manuscript-*.test.ts`): `source()` 404s on a withdrawn manuscript; `findManuscript()` (used by the download route) does not.
- `tests/e2e-connected` (`manuscripts.spec.ts`): withdraw a version → "What Raven learned" empties, the studio/plans checkboxes show "metadata only," manuscript search returns nothing, download still works → reinstate → knowledge reappears without re-reading.

## What this does not change

No change to `guard_manuscript_reference()`, no change to the storage no-delete/no-overwrite/no-anonymous restrictive policies, no new DELETE route, no service-role usage, no change to the "Request removal of this version" Desk-brief flow — that stays as the path for the rare case where actual erasure is truly required.
