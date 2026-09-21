# Character Studio — phase 1 schema

Phase 1 adds the database foundation for author-owned character identity, private portraits, and author-written notes. It is schema only. There is no Character Studio page, upload route, gallery, home showcase, or relationship map in the application yet. The migration is applied and recorded in the hosted database as of 2026-09-21; see VERIFICATION.md, including the note that an undocumented integration applied it on merge. The design preview in [design/character-studio-preview.html](design/character-studio-preview.html) remains a standalone concept.

## Why new tables were required

Three existing constraints ruled out extending what already exists:

- `public.characters` is book-scoped (`book_id` is `not null`), so it cannot anchor an identity that spans books or universes.
- `public.content_assets` is permanently read-only (`check(read_only = true)`) and manuscript-owned, so author portraits need their own table and Storage bucket.
- `public.book_characters` is extraction-owned and client-read-only, so author notes need a separate author-writable table.

`202609210001_character_studio.sql` adds that missing layer without changing any of the three. Its one change to an existing table is an additional unique constraint, `characters(author_id, book_id, id)`, which lets a link reference a character together with the book it belongs to.

## Tables

| Table | Ownership | Purpose |
| --- | --- | --- |
| `character_profiles` | Author, writable | Workspace-scoped identity: display name, normalized name, optional universe, summary, chosen primary portrait |
| `character_profile_aliases` | Author, writable | Searchable alternate names, unique per profile after normalization |
| `character_profile_links` | Author, writable | Explicit, reversible, author-confirmed link to one book-scoped `characters` row |
| `character_notes` | Author, writable | `author_confirmed` or `visual_inspiration` text, optionally scoped to a book |
| `character_portraits` | Server-written, author-removable | Private image records with stored path, rights and permission fields |

All five enable RLS, grant `select` to members through `private.can_read_author`, restrict writes to owners and editors through `private.can_edit_author`, and use column-level grants so `author_id`, `created_by`, `version`, and timestamps cannot be supplied or forged by a client. A private trigger advances `updated_at` and `version` on every accepted profile or note update, so a client can hold a version and detect a stale edit.

## Identity rules the schema enforces

- A shared name is not identity. Two profiles may carry the same normalized name; only a row in `character_profile_links` asserts that a book character is this person, and `unique(author_id, character_id)` keeps a book character from being claimed twice.
- A link is reversible. Deleting it removes the author's assertion and leaves `characters` and `book_characters` untouched; the composite foreign key `(author_id, book_id, character_id)` prevents linking a character to a book it does not belong to.
- Deleting a profile cascades only to the author's own rows — profiles, aliases, links, notes, portraits. Extraction output is never reached.
- Portraits and notes hang off the profile, not off a manuscript, so replacing or re-reading a manuscript preserves them.
- Notes have no manuscript-derived kind. Manuscript observations stay in `book_characters` with their citations, and a portrait is never evidence for a statement about a book.

## Portrait upload lifecycle

Portrait rows have no insert or update grant. They are written only through three RPCs that require the server-only `KIRA_AI_RECORDING_KEY` capability, in the same pattern manuscript uploads use, so an authorized member cannot fabricate a rights record or a sanitization claim through PostgREST:

| Function | Behavior |
| --- | --- |
| `character_portrait_register` | Validates type, size, hash and permission; derives the stored path as `author_id/profile_id/portrait_id`; idempotent by portrait ID and by content hash within the profile; reopens a storage failure for retry |
| `character_portrait_finish` | Marks the image stored, but only when the caller reports that location metadata was removed; records `sanitized_at` and optional dimensions |
| `character_portrait_fail` | Records `storage_error`, `sanitize_error`, or `unsupported_image` for the member who registered the upload |

A check constraint ties `storage_path` to the row's own identifiers, so the Storage policies can trust the path. `status = 'ready'` is unreachable unless `location_metadata_removed` is true and `sanitized_at` is set. `usage_permission` defaults to `private_reference_only`; `promotional_approved` requires a recorded source credit, because permission for private inspiration is not permission for public promotion.

The `kira-character-portraits` bucket is private, limited to 8 MB, and limited to PNG, JPEG, and WebP. Permissive policies allow a member to read a portrait of a workspace they can read, to upload only to the path of a row they registered and that is still `uploading`, and to delete their workspace's images. Restrictive guards repeat each rule so an unrelated permissive Storage policy cannot expose the bucket, and updates to objects in it are refused outright. Removing an image deletes the Storage object first, then the row.

## Verified

`tests/character-studio-database.test.ts` runs the real migrations in PGlite and covers tenant isolation, viewer denial, alias normalization, server-advanced versions and stale-edit detection, single reversible links, rejected foreign-book links, note kinds, direct-write refusal on portraits and on `book_characters`, capability and role requirements, registration idempotency, the sanitization requirement, bucket privacy and path binding, primary-portrait containment, and survival of portraits, notes, and links across a second manuscript reading. The full `npm run check` passes: TypeScript, ESLint, 525 unit/API/database tests, and the production build.

Not verified, because it does not exist yet: any hosted behavior. No EXIF-stripping upload route is implemented and no image has been stored. The hosted objects were inspected directly and match this document; that is schema verification, not feature verification.

## Remaining in the sequence

1. Server upload route that strips location metadata, hashes the image, and calls the three RPCs; the Studio gallery, search by name and alias, and the profile view.
2. Author-selected home showcase.
3. Optional Quiet Room.

A relationship map and richer promotional tooling follow confirmed identity and permission handling.
