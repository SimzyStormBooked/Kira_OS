# Character Studio — author profiles and manuscript links

Phase 1 adds the database foundation for author-owned character identity, private portraits, and author-written notes; the server upload route that sanitizes an image before it is stored; and the Character Studio gallery and profile view that an author actually uses. The current interface supports profile editing, author notes, confirmed manuscript links, a home showcase, the Quiet Room, and author-written relationships between characters. The migration is applied and recorded in the hosted database as of 2026-09-21; see VERIFICATION.md, including the recorded Codex integration session that applied it with verified TLS. The design preview in [design/character-studio-preview.html](design/character-studio-preview.html) remains a standalone concept.

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
| `character_relationships` | Author, writable | A directed, author-written sentence connecting two of the author's own profiles |

All six enable RLS, grant `select` to members through `private.can_read_author`, restrict writes to owners and editors through `private.can_edit_author`, and use column-level grants so `author_id`, `created_by`, `version`, and timestamps cannot be supplied or forged by a client. A private trigger advances `updated_at` and `version` on every accepted profile or note update, so a client can hold a version and detect a stale edit.

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

Verified in a connected browser: `tests/e2e-connected/characters.spec.ts` drives the real interface against the simulated Supabase boundary on desktop and mobile — creating a character, finding her again by alias, uploading a portrait, refusing one that cannot be cleaned, requiring a source credit for promotional use, choosing a cover, and reading a confirmed book link. It asserts against what actually reached private storage: the stored bytes carry no location metadata, their hash matches the registered hash, and the rendered image decodes at its true dimensions through an expiring signed link. The image decoding matters — a container rewrite can strip metadata and quietly corrupt the picture, and no unit test here decodes an image.

Not verified: the hosted workspace. No image has been uploaded to the hosted bucket, and the simulated boundary is a transport double, not a database — SQL and RLS are proven separately by the PGlite tests.

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
| `GET /api/characters/[id]` | One profile with all portrait URLs, notes, links resolved to book titles and character names, and every relationship that names it on either side |
| `PATCH /api/characters/[id]` | Renames, edits the description and aliases atomically, or chooses the cover portrait; requires the version the client is holding |
| `GET /api/characters/sources` | Current manuscript characters and source sections, optionally scoped to a book |
| `POST /api/characters/[id]/links` | Requires an explicit identity confirmation and the current source manuscript ID |
| `DELETE /api/characters/[id]/links` | Removes only the confirmed identity link |
| `POST /api/characters/[id]/notes` | Saves an author-confirmed reference or visual inspiration note |
| `PATCH /api/characters/[id]/notes/[noteId]` | Updates an author note with an expected-version check |
| `GET /api/characters/relationships` | Every relationship in the workspace, with both profile names and any book title resolved |
| `POST /api/characters/relationships` | Creates one relationship from `profileId` to `relatedProfileId`; refuses a relationship to oneself |
| `PATCH /api/characters/relationships/[relationshipId]` | Edits the label, note, or book with an expected-version check; the two characters it names cannot change |
| `DELETE /api/characters/relationships/[relationshipId]` | Removes only the relationship; both profiles stay saved |

A portrait's path is never exposed as a field, and reaching the image always requires a signature that expires. A read produces a signed URL valid for five minutes, and the gallery signs only the cover so a long cast does not mint dozens of URLs per view. The signed URL does contain the object path, because that is what Storage signs — the protection is the expiring signature and the bucket's policies, not a secret path. Next's image optimizer is deliberately bypassed for these: it would proxy and cache private portraits through a shared optimizer. A cover can only be a portrait of that same profile, which the composite foreign key enforces in SQL rather than in the route.

Every edit sends the version the client is holding, so a stale save is refused with a conflict instead of overwriting a change made in another tab. The trigger advances the version on the server, so a client cannot forge one.

## Editing and source continuity

`202609260002_character_profile_editing.sql` adds the caller-scoped `character_profile_save` RPC. Profile details and aliases save in one transaction, so an invalid alias cannot leave a partially saved profile. Viewers remain read-only.

New identity links retain `source_manuscript_id` with a composite foreign key to that manuscript’s character observation. The profile can reopen the original cited passage even if a newer manuscript becomes active. Legacy links retain a null source version instead of inventing one. Manuscript observations are never rewritten as author-confirmed notes.

Character creation, editing, notes, and link-form drafts are kept per account in this tab’s session storage, survive form dismissal and navigation, and join the existing sign-out/session-expiry rescue. Saving or explicit discard clears the draft. If browser storage fails, the interface explains that the entries may not survive a reload.

## Home showcase

`202609290001_home_showcase.sql` extends `character_profile_save` with one more key, `home_showcase_pinned`, rather than adding a parallel RPC. Pinning sets `home_showcase_pinned_at` to the current time; unpinning clears it; re-pinning an already-pinned character advances the timestamp, moving her to the end of the order. The showcase is capped at 6 — a celebration of a few chosen characters, not the whole cast — checked only when actually pinning, so unpinning always succeeds even while full. The cap violation carries its own error code (`23514`, distinct from the generic `22023` validation failures) so the interface can show its exact, actionable text instead of a generic message.

`GET /api/workspace/resume`, the same small summary the home page already loads, now also returns `showcase`: up to 6 pinned characters ordered oldest-pin-first, each with just a display name and a signed cover URL — no counts, no portrait metadata beyond what a warm home-page tile needs. An author pins or unpins from her own profile page (`Show on your home page` / `Shown on your home page`, beside `Edit character`). The home page renders nothing at all when nothing is pinned: an empty showcase is not a nudge to fill it.

## Quiet Room

A small, optional, calm view at `/quiet-room`, reachable from a `Quiet Room` link in the topbar next to Guide and Search. It stays inside the normal workspace shell — the return path is the same persistent nav that is always there, plus an explicit "Return to Mission Control" link — rather than a bespoke chrome-less page to design and maintain separately. Content is deliberately restrained: a literary quote (a different one from the home page's daily quote, and a different one each day from the Quiet Room's own rotation), one pinned character named warmly if the workspace has any, and nothing else. No form, counter, timer, or productivity target appears there; a browser test asserts as much directly. Demo mode shows the quote and the calm framing without a character, since there is no real cast to name.

## Relationships

`202609290002_character_relationships.sql` adds `character_relationships`: one row is one sentence the author wrote, read as "*profile* *label* *related profile*" — for example, "Celine is the mother of Brick". It is a list of statements, not a node-and-edge diagram; nothing in the project called for a graph, and the rest of Character Studio is deliberately calm and text-first.

- **Directed, with no invented inverse.** Only the direction the author wrote exists. If both sides should say something, the author adds a second, independent relationship. The interface says so where the relationship is written, and a browser test asserts that Brick's page shows Celine's sentence verbatim rather than a guessed "is the child of".
- **Author-owned, never extraction-owned.** Manuscript extraction already produces a free-text `relationships` field per character observation. That stays an unreviewed guess about one book, tied to a book-scoped character, and is neither read nor rewritten here. A relationship is a first-person assertion between two workspace-scoped identities — the same authority an author-confirmed note already has (`data_origin` is pinned to `manual`).
- **Tenant and self checks live in SQL.** Both profiles are held by composite foreign keys on `(author_id, id)`, so a relationship cannot reach another workspace's character, and a check constraint refuses a relationship to oneself. The route and the form repeat the self check so the author sees a plain message instead of a database error.
- **Either page can edit it.** A relationship belongs to the workspace, not to one profile, so it is created, edited, and removed at `/api/characters/relationships` rather than under either character's path, and both characters' pages list it and offer the same actions. Editing changes the label, note, or book; to point it at someone else, remove it and add a new one.
- **Stale edits are refused.** Like every other Character Studio edit, a save carries the version the client holds, and the trigger that advances `version` and `updated_at` is server-side.
- **Deleting a profile removes only the relationships that name it** (`on delete cascade`), never an extraction record.

The relationship form, like the note form, does not yet offer a book picker: `book_id` is accepted and validated by the API and schema but left empty from this interface. Drafts are kept per account in this tab exactly as notes and links are.

## Remaining in the sequence

Richer promotional tooling follows confirmed identity and permission handling.
