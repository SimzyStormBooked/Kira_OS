# Manuscript foundation: author and operator guide

This release adds a private, editable book library and versioned manuscript reference knowledge to **The Universe**. Raven reads existing writing to help understand the books; it does not write or rewrite fiction. The foundation is deployed and the real upload → AI extraction → persisted findings/characters → reload → citation → text-search flow passed with an explicitly synthetic operator document on September 18, 2026. The test records and private file were then removed; the eight existing catalog books and six saved briefs remain. See [VERIFICATION.md](../VERIFICATION.md) for the tested scope.

## For Cassandra

### Add a book and its details

1. Open **The Universe → Add book**. A title is enough to start.
2. Choose an existing series, create a series, or leave the book standalone. Add its position if useful.
3. Add your existing description and genre in your own words. Optional audiobook fields include availability, narrator, runtime in minutes, and marketing notes.
4. Save. Use **Edit book details** whenever those details change. These changes update your private workspace; they do not update your author website, retailers, or social accounts.

Existing publicly sourced titles retain their author-site source links until you replace their details with member-provided information. Edits create attributed sources, and prior source records remain stored. Book descriptions and manuscript findings are separate records. If another person edits the same book first, reload before saving again; the application rejects overwriting a newer edit.

### Save a manuscript, then let Raven read it

1. Open the book and choose its manuscript file. Supported formats are **DOCX, text-based PDF, EPUB, UTF-8 TXT, and Markdown (.md)**.
2. Read **What happens to your file**, then confirm that you have permission to upload the manuscript and to let Raven read it privately for book knowledge. This permission does **not** authorize publishing excerpts.
3. Choose **Save manuscript**. The file is parsed and saved privately; nothing is read yet.
4. Choose **Start reading with Raven** when you are ready. Reading uses workspace AI credits. After reading starts, leave the page or close the tab. Progress counts completed passages. **Pause reading** prevents additional groups from starting; up to two in-flight groups can still finish. **Resume reading** continues only unfinished passages.

Each reading step uses workspace AI credits. A durable Vercel Workflow continues after the page closes. Reopen the book to see saved progress or completed findings. Errors pause the job for an explicit retry; progress is retained. Do not assume processing has completed merely because the upload finished.

The screen says “4 MB”; the enforced file limit is **4 MiB (4,194,304 bytes)**. Scans without embedded text, encrypted/protected documents, unsupported encodings, and oversized or malformed archives need a clean text export. The application does not run OCR or remove document protection.

### If reading pauses or an upload fails

| What you see | What to do |
| --- | --- |
| **Ready to read** with an AI setup/connection message | The parsed manuscript is saved. Resolve the workspace AI connection or credits, then choose **Resume reading**. Re-uploading is unnecessary. |
| **Upload needs to finish**, or an upload-storage error | Select the same file and confirm permission again. The original uploader can finish that upload. An identical file does not create another version of the same book. |
| **Reading in progress** after reopening the page | A submitted step may still be finishing. Resume to check; the database prevents another paid call for a pending step. If it was interrupted, wait two minutes before explicitly retrying the unfinished step. |
| **Reading paused — needs attention** | Read the error, then choose **Retry unfinished reading** when ready. A failed or interrupted paid call may already have consumed credits. Successfully saved passages are not repeated. |
| Daily reading limit reached | Resume after the next UTC day begins. Completed work stays saved. The limit is shared by the workspace. |
| File cannot be read | Export an unencrypted supported format and try again. Format/parse errors occur before registration and AI spending. |

Retrying an identical upload recovers a lost upload response by checking the stored file's size and checksum before attaching passages. A failed reading step is retried only after an explicit resume/retry request; there is no automatic paid retry loop after an error.

### Check what Raven learned

**What Raven learned** contains extracted observations and possible marketing directions, with model, reading date, and manuscript version. The extraction is selective; it is not a complete editorial analysis or a guarantee that every character or theme was found.

- **Manuscript-supported · unreviewed** is an AI claim tied to a cited passage, not author verification. Exact quote checks establish that the quote exists in this version; you still judge whether it supports the conclusion.
- **Marketing / interpretive inference** is an interpretation or proposed direction for your judgment. It is not evidence of sales, audience response, or market performance.
- **Show source** opens the original stored passage from that finding's manuscript version. The text is private reference material and may contain spoilers; it is not approved marketing copy.
- Potential spoilers are hidden until you choose **Reveal plot details and potential spoilers**. Spoiler classification is also an AI judgment, so it cannot promise that every reveal was recognized.
- Character observations retain their version and sources. Matching names are associated within the same book; identical names in different books are not automatically merged. The current screen shows observations, not a fully reconciled character encyclopedia.

Use **Find it in your manuscript** for names or words in the active completed version. Explicitly enable manuscript excerpts first; they may contain spoilers. This is text search and uses no AI credits. It is not a semantic question-answering chat, and Ask Raven does not automatically retrieve these passages yet.

**Bring a business question to your desk** prepares a review brief from your supplied book details and questions. It does not silently approve extracted findings or authorize an external action.

### Bring a revision

Upload a changed file to the same book. A different file checksum creates a new numbered version; the same file checksum reuses the existing version. Even a file with identical prose can count as a revision if its document bytes changed.

The previous completed version remains active while the replacement is being uploaded or read. The replacement becomes active only when all of its passages finish successfully. A late completion of an older version cannot replace a newer active version. **Where your manuscript lives** lists the saved versions, their statuses, and which version the current findings came from. This release does not provide a version-rollback, file-deletion, or older-version knowledge-switching interface.

## Privacy and authority

The original file is stored in the private Supabase bucket `kira-manuscripts`. Parsed passages, extracted observations, character records, permission attribution, and processing results remain in the authorized author workspace. Owners, editors, and viewers can read that workspace's library; owners and editors can change catalog details and submit manuscripts. “Private” means restricted to the workspace's members, not exclusive to the uploader.

The permission checkbox records the authenticated uploader and time for private reference analysis. Submitted passage groups are sent through Vercel AI Gateway to **`google/gemini-3.8-flash`** for extraction and, when available, **`openai/text-embedding-3-small`** for the optional search index. This is not processing confined entirely to Supabase or the user's device. The application does not claim a provider retention or training policy beyond the configured services' terms.

The web runtime uses the signed-in caller's Supabase client, tenant-scoped queries, database row-level security, and a separate server-only recording capability. It does not use a service-role key. Manuscript paths are registered to an author, book, and version before upload; there are no public manuscript URLs or overwrite/upsert actions. Provider inputs are untrusted data, and the extraction agent has no external-action tools.

## Operator runbook

### Provision and release

1. Confirm connected-mode authentication, configured author membership, and the existing setup in [SETUP.md](../SETUP.md). Use a separate database for previews.
2. Apply [202609190001_manuscript_intelligence.sql](../supabase/migrations/202609190001_manuscript_intelligence.sql) after the earlier migrations. It extends books/chunks, creates manuscript/batch/intelligence/character-appearance tables, and installs scoped RPCs and guards.
3. Verify that the **actual Supabase Storage schema exists** and that `kira-manuscripts` is private with a 4,194,304-byte limit and its expected MIME list/policies. The migration conditionally skips Storage setup in SQL-only environments; successful SQL application alone is not proof of a working bucket.
4. Reuse the existing server-only `KIRA_AI_RECORDING_KEY` and its hash in `private.workspace_generation_config`. Upload registration and protected chunk writes need this capability even when AI is disabled. Do not send the key to the browser or documentation.
5. Verify Gateway authentication, funded credits, and `KIRA_AI_ENABLED=true` before testing actual extraction. `false` allows authenticated library/upload behavior but leaves reading queued with an explicit setup error; no demo result substitutes for AI.
6. Run the checks below, deploy the matching application, and perform the hosted smoke test with a clearly labeled synthetic operator book. Record the release, date, environment, and outcome separately from local fixture results.

### Limits and durable processing

| Boundary | Enforced limit/behavior |
| --- | --- |
| File | Nonempty; at most 4 MiB; supported extension and matching MIME; filename at most 255 characters |
| Parsed text | At least 40 characters; at most 1,500,000 text characters; no silent truncation |
| Passages | At most 500 per version; at most 4,000 characters each; immutable text checksum and section/page locator |
| Archives | At most 2,000 entries and 20 MiB total expanded bytes; traversal, symlinks, encryption and unsafe entities rejected |
| PDF / EPUB | At most 1,200 PDF pages / 1,000 linear EPUB spine items, also subject to text and passage limits |
| Reading batch | At most four passages and 16,000 characters; extraction capped at 6,500 output tokens |
| Provider timing | Extraction timeout 45 seconds; optional embeddings timeout 15 seconds; upload/process route budgets 60/90 seconds |
| Daily allowance | At most 150 newly reserved manuscript batches per author per UTC day; failed reservations count |
| Output | At most 16 facts and eight character observations per batch; every candidate has exact, batch-bound passage citations |
| Index | 1,536 dimensions with an explicit embedding-model identifier; malformed/unavailable optional embeddings fall back to saved extraction and text search |

`manuscript_begin_batch` reserves a request UUID and exact passage IDs before a paid call. Only a newly created reservation invokes the provider. A reused UUID does not trigger another call; a pending batch blocks new work for that manuscript. Terminal outcomes are immutable. Interrupted batches need an explicit retry after the two-minute pending window, and that retry uses a new request UUID.

`manuscript_finish_batch` rechecks role, permission, tenant, actor, citations, usage and vectors before saving. Successful passage groups remain durable between page visits. A transient persistence failure is retried once with the same result and request ID, without rerunning the model. If both writes fail, the UI reports the problem; it does not claim the paid result was saved. A later explicit retry may incur another charge for that unfinished group.

Inspect `manuscripts` for status, error code and completion counts; `manuscript_batches` for request status, model, token usage, estimated cost and available generation references; and `book_intelligence` for the completed version's profile. Avoid copying manuscript text or credentials into incident logs. The original file, parsed chunks and cited source records are distinct from generated observations. Do not repair a failed job by replacing protected source text, marking partial work ready, or bypassing caller/recording checks.

The model receives a simplified object/type/enum schema because the hosted Google/Vertex endpoints rejected the deeply constrained grammar. The application still validates every UUID, text/count bound, field, and exact source citation against the original strict contract before accepting output; SQL validates it again. [Google documents structured-output constraints](https://ai.google.dev/gemini-api/docs/structured-output).

Optional embedding failure never requires rerunning successful extraction. This release has no embedding-backfill UI and does not expose semantic search in the author interface. Cost records are estimates, not a substitute for the provider's billing record.

### Google Drive adapter path

**Google Drive import is not implemented or connected.** Today, bring a locally exported supported file through the same upload control. Saving a Drive or NotebookLM shortcut does not grant import access, transfer documents, or keep a book synchronized.

A later authenticated Drive adapter should fetch one explicitly selected, permitted file/export into bounded server-side bytes, then reuse the existing validation → parsing → registration → private storage → chunk sealing → batch-reading path. Capture its source file/revision reference as provenance, record the member's analysis permission, and treat each changed file as a new immutable manuscript version. Preserve workspace scoping and existing file/expanded-text limits. Do not add arbitrary-URL fetching, automatic folder ingestion, or public share links as substitutes for authenticated source access. No adapter file, OAuth flow, Drive scope grant, polling worker, or synchronization promise ships in this foundation.

## Verification and remaining scope

Run the repository check and focused browser suite from the repository root:

```sh
npm run check
npm run test:e2e:connected -- manuscripts.spec.ts
```

The connected suite runs a production build against a **loopback simulated Supabase boundary**, with AI disabled. Its explicit test-only ready-state injection supplies synthetic findings to exercise citations, spoiler controls, source search, revision display, desktop/mobile layouts and accessibility. It verifies application wiring, not real hosted Storage, RLS, or paid extraction.

Database tests in `tests/manuscript-database.test.ts` independently exercise the migration, tenant/role isolation, private Storage policy stubs, provenance protection, batch idempotency, daily limits, permission checks and revision races. Parser tests cover supported formats and unsafe inputs; provider/API tests use mocks to check exact citations, optional-index fallback, origin/role checks, upload-response recovery and persistence without duplicate paid calls. After the provider compatibility fix, all 465 tests across 31 files, TypeScript and lint pass, and the production build passes. The 20 selected connected desktop/mobile browser checks passed. See [VERIFICATION.md](../VERIFICATION.md) for the scope of each check.

For hosted verification, separately confirm: real owner/editor upload and private Storage access; viewer read and denied mutation; an actual bounded extraction and saved usage record; reload/source lookup/text search; a queued replacement preserving the completed version; and unauthenticated/foreign-workspace denial. Use authorized synthetic material and avoid publishing or mailing it. **Hosted manuscript result:** owner upload, real extraction, persisted character/findings/usage, reload, source lookup, text search, duplicate reuse, desktop/mobile layout, sign-out denial, private bucket and denied anonymous file access passed on deployment `dpl_7SYyDFMKaD2b9L99BshDYUa5nifJ`. Viewer/cross-author/replacement controls are covered by local SQL/API/browser tests; this hosted smoke did not impersonate another author or viewer. The synthetic book/file were cleaned up afterward.

The next increments remain separate work: strategy briefs and revisions, flexible measurable goals, owner/admin strategy review, release-date-anchored 30/60/90 plans, cross-book recommendations, and automatic manuscript retrieval in Ask Raven. This foundation does not start autonomous agents, publish content, schedule campaigns, connect social accounts, or train a model from uploaded manuscripts.

### Citation failure recovery (September 20, 2026)

A nonempty response with one inaccurate quotation previously failed the entire passage group, including independently valid findings. Candidate selection now omits a whole finding or character observation if any of its citations fails the exact, batch-bound source check. It never rewrites source quotations, drops just one citation from a multi-citation claim, or accepts a foreign passage. Accepted candidates still pass the strict application and database validators. Malformed responses and nonempty responses with no verified candidates still fail explicitly. Valid findings from an otherwise partially unsupported response can therefore be saved without another paid generation. The author-facing knowledge section explains this selective extraction; a validation failure explicitly says the upload is already saved and does not need re-uploading.
