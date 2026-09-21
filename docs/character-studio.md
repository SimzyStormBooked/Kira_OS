# Character Studio — phase 1 schema

Phase 1 adds the database foundation for author-owned character identity, private portraits, and author-written notes; the server upload route that sanitizes an image before it is stored; and the Character Studio gallery and profile view that an author actually uses. The home showcase, Quiet Room, and relationship map are not built, and notes and book links are displayed but not yet editable in the interface. The migration is applied and recorded in the hosted database as of 2026-09-21; see VERIFICATION.md, including the note that an undocumented integration applied it on merge. The design preview in [design/character-studio-preview.html](design/character-studio-preview.html) remains a standalone concept.

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

Verified in a browser: the demo-mode page renders with no console errors on desktop and at 375px, and `/characters` passes the automated accessibility sweep on both viewports with zero violations.

Not verified: the connected path in a browser. Exercising the real gallery, upload, and signed URLs needs either the hosted workspace's credentials or Character Studio support added to the simulated Supabase fixture in `tests/e2e-connected/supabase-fixture.ts`; neither has been done, so the connected UI is covered by route and repository unit tests only. No image has been uploaded to the hosted bucket.

## Upload route

`POST /api/characters/portraits` accepts a multipart form with `profileId`, `file`, `permission`, and optional `usagePermission`, `sourceCredit`, and `caption`. It requires a same-origin request and an owner or editor, refuses an unknown field, and refuses a file whose name and declared type disagree or that exceeds 8 MB. `promotional_approved` is refused without a recorded source credit, in the route and again in SQL.

The order is deliberate: metadata is removed first, so an image that cannot be cleaned never produces a database row and never reaches storage; then the sanitized bytes are hashed and registered; then the object is uploaded; only then is the image marked stored. If the upload reports an error, the route downloads the object and compares its hash before deciding between success and `storage_error`, so a lost response cannot be mistaken for a lost file. The response carries no storage path and lists what was removed.

`lib/characters/image.ts` rewrites the container rather than re-encoding pixels. JPEG loses every `APPn` and comment segment, PNG keeps only an allowlist of chunks (dropping `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME`, `iCCP`), and WebP loses `EXIF` and `XMP ` chunks with the advertising flags cleared in `VP8X` and the RIFF length rebuilt. All three drop anything appended after the image's own end marker, which is where an appended payload would hide. A container the sanitizer cannot fully parse is rejected with 422 rather than stored. Colour profiles go with the rest, which can shift rendered colour slightly; that is the accepted trade for not storing an uninspected ICC blob.

## Gallery and profile view

`/characters` lists the workspace's characters, searchable by display name **and** alias, because the name a reader uses is often not the author's. `/characters/[id]` shows the portraits, the author's notes, and the confirmed book links, and carries the upload form. Both are connected-mode only: in the shared demo workspace the page explains that a cast lives in a private workspace rather than inventing one.

| Route | Behavior |
| --- | --- |
| `GET /api/characters` | The gallery: every profile with its aliases, portrait and book counts, and a signed URL for its cover only |
| `POST /api/characters` | Creates a character with optional aliases and the author's own description |
| `GET /api/characters/[id]` | One profile with all portrait URLs, notes, and links resolved to book titles and character names |
| `PATCH /api/characters/[id]` | Renames, edits the description, or chooses the cover portrait; requires the version the client is holding |

Portraits never travel as paths. A read produces a signed URL valid for five minutes, and the gallery signs only the cover so a long cast does not mint dozens of URLs per view. Next's image optimizer is deliberately bypassed for these: it would proxy and cache private portraits through a shared optimizer. A cover can only be a portrait of that same profile, which the composite foreign key enforces in SQL rather than in the route.

Every edit sends the version the client is holding, so a stale save is refused with a conflict instead of overwriting a change made in another tab. The trigger advances the version on the server, so a client cannot forge one.

## Remaining in the sequence

1. Writing notes and creating or removing book links from the interface; both are read-only there today.
2. Author-selected home showcase.
3. Optional Quiet Room.

A relationship map and richer promotional tooling follow confirmed identity and permission handling.
