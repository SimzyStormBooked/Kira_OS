# KIRA OS verification

## Current checkpoint — September 20, 2026

Production migration history was checked directly over verified TLS at **2026-09-21 05:31 UTC (September 20, 10:31 PM Arizona)**. All **14** SQL migrations in this repository are recorded in `supabase_migrations.schema_migrations`; there are **zero pending migrations**. The stored SQL for the three September 20 migrations exactly matches the repository files:

| Migration | Hosted status | Stored SQL vs repository |
| --- | --- | --- |
| `202609200001_background_reading.sql` | Applied and recorded | Exact match |
| `202609200002_ads_dashboard.sql` | Applied and recorded | Exact match |
| `202609200003_character_organization.sql` | Applied and recorded | Exact match |

The audit was read-only. No migrations were re-applied, no migration history was repaired, and no manuscript processing was restarted. The sanitized result is preserved in [migration-checkpoint-2026-09-20.json](docs/migration-checkpoint-2026-09-20.json). This supersedes any review note suggesting these three migrations are unrecorded or still waiting to be pushed.

The most recently verified application release is `131c4ed` (Vercel `dpl_4U9qGTk28nKBvxv33yDy7NNDEDnJ`), deployed at the canonical production alias. It includes the focused manuscript knowledge interface and evidence-carrying Raven/Desk actions. Release checks passed 515 unit/API/database tests, TypeScript, ESLint and the production build; all eight targeted manuscript desktop/mobile browser tests passed after the final changes, including automated accessibility checks. The authenticated production check confirmed the new UI bundle, available Celine knowledge, and anonymous API access denial. These are recorded results from that release, not a claim that a new adversarial review or physical-device study has completed.

Current scope and open review items are captured in [the continuation handoff](docs/continuation-handoff-2026-09-20.md). **Character Studio's phase 1 schema is applied to the hosted database; it has no deployed feature and its interface remains a design preview.** Automatic report emails remain explicitly deferred by the owner. Meta Ads activation still requires provider configuration and consent; no live Meta account connection is claimed.

## Character Studio phase 1 — applied to the hosted database

`202609210001_character_studio.sql` is recorded in `supabase_migrations.schema_migrations` as `character_studio`, bringing the hosted total to **15** migrations with zero pending. Its stored SQL matches the repository file exactly (whitespace-normalized; recorded as a single statement). Checked directly on 2026-09-21 after the merge of `07b9ec2` to `main`.

Verified present in the hosted database: all five tables (`character_profiles`, `character_profile_aliases`, `character_profile_links`, `character_notes`, `character_portraits`) with row level security enabled on each, 16 policies across them, 8 `kira_portrait*` policies on `storage.objects`, the three `character_portrait_*` RPCs, and the private `kira-character-portraits` bucket limited to 8388608 bytes and PNG/JPEG/WebP. The `authenticated` role holds only SELECT and DELETE on `character_portraits`, so portrait rows remain writable exclusively through the capability-gated functions. All five tables are empty, and the existing 31 characters, 31 `book_characters`, and 10 books are unchanged.

Two honest limits on that check. The connection used TLS but did not verify the certificate chain, because Supabase's CA is not available on this machine; this is a weaker guarantee than the September 20 audit recorded. And the migration was **not** applied by hand here: it was already recorded when this workspace first connected, roughly ten minutes after the merge and the 17:26 UTC production deployment. No GitHub Actions workflow, build migration step, or deploy hook in this repository applies migrations, so an external integration does. **That mechanism is undocumented and should be confirmed in the Supabase dashboard**, because it means merging to `main` can change production schema without an explicit apply step — the opposite of what earlier handoffs assumed.

The sanitizing upload route was added afterwards (`POST /api/characters/portraits`), covered by 15 unit tests: metadata removal for JPEG, PNG, and WebP including appended-payload stripping and refusal of unparseable containers, plus route-level cross-origin and viewer refusal, permission and promotional-credit requirements, sanitize-before-register-before-store ordering, hash verification after a failed upload, duplicate handling, and absence of the storage path from the response.

The gallery and profile view were added afterwards at `/characters` and `/characters/[id]`, with `GET`/`POST /api/characters` and `GET`/`PATCH /api/characters/[id]`. Portraits are read through five-minute signed URLs and no storage path appears in any response. 23 new unit tests cover the sanitizer, the upload route, and the gallery routes; the full `npm run check` passes with 548 tests across 44 files, and the 20-test demo browser suite passes, now including `/characters` in the automated accessibility sweep with zero violations on desktop and mobile.

One flake worth recording: `search and responsive navigation work without overflow` failed once in a parallel run against a 5-second timeout, then passed in isolation both with and without these changes and passed in a full re-run. It is first-compile latency, not a regression.

Still absent: the connected path has never run in a browser. Exercising the real gallery, upload, and signed URLs requires the hosted credentials or Character Studio support in the simulated Supabase fixture, and neither has been done. No image has been stored in the hosted bucket, and notes and book links are read-only in the interface. Schema, a route, and a rendered page are not the same as a verified working feature.

## Character Studio phase 1 — local schema checks

`202609210001_character_studio.sql` adds author-owned character profiles, aliases, reversible author-confirmed book links, author notes, and private portraits with retained source, credit, and usage permission. `tests/character-studio-database.test.ts` applies the real migrations in PGlite and passes 10 checks covering tenant isolation and viewer denial, server-advanced versions and stale-edit detection, single reversible links, rejected foreign-book links, refusal of direct portrait and `book_characters` writes, the server-capability requirement, registration idempotency, the location-metadata requirement before an image counts as stored, bucket privacy and path binding, and survival of portraits, notes, and links across a second manuscript reading. The full `npm run check` passed: TypeScript, ESLint, 525 unit/API/database tests across 41 files, and the production build.

This is a local schema result. Hosted state is recorded in the entry above.

## Historical verification entries

The entries below describe their named releases and verification dates; statements about future work or unavailable integrations are historical, not the current feature inventory.


Updated after the first adversarial UX review and production AI activation. Release `562c108` is READY at [KIRA OS](https://kira-os-dusky.vercel.app), backed by dedicated Supabase project `obusnqlwuoavwtmryiik`. Vercel deployment `dpl_5d3psvQaerzRGgC2vjEASMHbwBXy` ([deployment URL](https://kira-8offqrgs9-storm-booked.vercel.app)) is aliased to the canonical site. The deployed release includes the reviewed UX fixes, live Ask Raven, Learn & Create, access/password controls, saved links, and gated Meta authorization.

## Hosted core workflow — verified

Michael’s real email-confirmed administrator account signed in through the deployed app. A real business brief was saved in Supabase, survived reload, appeared in a separate browser session, and remained protected after sign-out. The browser reported no page errors during this workflow. The database contains eight sourced books and zero demo intelligence; public signup is disabled.

The Vercel runtime uses publishable/anon Supabase credentials and caller sessions. Seven privileged integration-injected secrets, including service-role/secret credentials and privileged database connection values, were removed from the runtime. No service-role key is required by the application.

These core checks establish real hosted storage and authentication. The real deployed AI workflow is recorded separately below; no Meta account has been connected.

The Studio, access, and manual-links migrations have since been applied to the hosted database, and the private AI recording key/hash has been provisioned. The Meta migration, encryption key/capability hash, and the forward-only Studio validation migration are also applied. No Meta account is connected.

## Earlier workspace release checks

| Check | Result |
| --- | --- |
| Full `npm run check` | PASS: TypeScript, ESLint, 336 unit/API/database tests across 24 files, production build |
| Demo browser workflows | PASS: 20 tests on desktop and mobile |
| Connected browser workflows | PASS: 74 desktop/mobile tests against isolated simulated Supabase, including links, Studio setup, learning, access, password, draft retention, decisions, search, async recovery, and permission recovery |
| Studio boundary tests | PASS: same-origin/body limits, roles, pending-before-model ordering, idempotency, rate limits, recorded failure, and persistence-only retry |
| Studio SQL controls | PASS: tenant RLS, viewer denial, private recording capability, direct-write rejection, immutable final results, strict JSON/null checks, and source-excerpt checks |
| AI provider requests during local tests | Mocked; no live model calls made |
| Latest Meta regressions and integrated Connections/Studio browser checks | PASS: authorization replay/revocation/scope checks and Connections/Studio desktop/mobile flows |

All 94 browser tests passed across the demo and connected suites for that earlier workspace release. Tests use Node 24.16, Next.js 16.3.5, React 19.3, Chromium desktop, and an emulated mobile viewport. Physical Safari has not been verified.

The simulated Supabase service is only browser-test infrastructure and is never imported by the application. PGlite separately executes actual SQL migrations with pgvector and emulated Auth primitives. It checks RLS, role isolation, provenance, expected versions, immutable decisions, and audit events; it does not replace a hosted provider test.

## Learning and first use

The curated idea shelf changes only on user input. It opens an editable brief without saving one. Literary quotes link to source texts and retain context. Optional guidance can be hidden/reopened, used with a keyboard, and dismissed with Escape.

Unfinished desk text survives internal navigation without entering localStorage, API writes, or review exports. Replacing existing words requires a choice. A delayed save clears only the submitted scratchpad revision. Learn & Create assembles a local blueprint from editable recipe fields, and saves only through its explicit desk action. Viewers can learn, copy, and download while server write permission remains closed.

## Adversarial UX changes — deployed; regression checks passed

The review identified concrete usability issues: workshop notes could be lost on a Desk round trip, search did not actually find saved briefs, final decisions lacked an explicit confirmation, shared starter work appeared to complete personal onboarding, and several labels implied monitoring or showed mostly empty catalog sections. The implementation now addresses these flows. Independent review also identified and fixed Studio retry-identity and delayed-answer navigation issues.

Dedicated browser regressions have been added for:

- Saved-brief search, selecting pending/reviewed records, keyboard focus, and unavailable result handling.
- Final-decision confirmation, safe cancel, failure/retry, and refusing a changed version.
- Desk/workshop/question draft retention, account/session clearing, explicit sign-out confirmation, and failed-sign-out preservation.
- Per-recipe blueprint previews, explicit AI-answer-to-Desk attribution, retained retry identity, intentional new questions, and late responses that do not steal navigation.
- Sourced book-detail collection, collapsed future sections, protection of existing Desk drafts, and accurate shared-workspace onboarding/Raven labels.
- Owner/editor/viewer setup guidance, unavailable-to-ready status refresh, Meta configuration versus authorization, and session-expiry recovery. Status checks make no purchases or authorization mutations.

The new regressions passed in the complete 74-test connected suite. They use the isolated fixture and mocked AI/Meta responses. Two initial failures were test-harness issues (awaiting a canceled reload and querying a dialog-hidden heading); both were corrected before the successful complete rerun.

The hosted audit on `eea4751` (production deployment `dpl_5rmKBVBY3VhKaackUnnu6xojNvnd`) passed all 18 main page/viewport checks and 12 desktop/mobile task checks. It used Cassy's real Editor account, verified draft/preview retention, saved-brief search and focus, safe decision cancellation, and sign-out/discard behavior. There were zero detected axe violations, horizontal overflows, browser runtime errors, or server errors. It made no workspace-record mutations. A CSS specificity issue initially left mobile workshop fields at 12px; the corrected 16px rule passed the live rerun and 12 focused local mobile regressions. Physical iOS Safari remains untested.

Two independent adversarial persona reviews assessed the supported workspace at 8/10 after the fixes (visual design 8–8.5). These are heuristic reviews, not actual male/female user research or measured satisfaction. Meta authorization and autonomous/background workflows are not included as working features. Final small polish aligns the Guide's Briefings name, provides a direct password shortcut, and reduces the ready-state Raven banner.

Michael explicitly authorized a welcome email. It was sent through his Gmail account to Cassy's specified address with private sign-in details and first-use instructions; Gmail confirmed the SENT label. Credentials are excluded from the repository and verification artifacts.

## Live production AI workflow — verified

The owner funded AI Gateway, and a direct connectivity probe against `google/gemini-3.8-flash` succeeded. The observed funding balance was $15 before the later application check; it is not a claim about the remaining balance after usage. Production now has `KIRA_AI_ENABLED=true` with the recording capability configured.

A real question was submitted through the production UI and completed as generation `be99db77-8aa8-442e-888f-33563b9e6bd3`. Its saved answer survived reload. Explicitly choosing **Save answer to my desk** created attributed brief `0425c388-24c5-4ba3-8ea8-279338955d87`, which remained pending for human review; the saved state and repeat-save prevention survived reload. Sign-out then restored a 401 response from private API access.

The generation recorded 1,018 input tokens and 1,078 output tokens, with an estimated model cost of **$0.004806**. This is the application's estimate, not a reconciled provider invoice. The hosted check establishes the real UI → authenticated API → model → durable answer → review-brief flow. It does not activate autonomous agents, background research, social synchronization, publishing, or message sending.

Meta app credentials are missing. OAuth, encrypted credential storage, account verification, and disconnection code still require actual provider configuration and consent testing. Manual saved links and the NotebookLM copy bridge are separate from authorization or synchronization. Social metrics ingestion and external publishing remain unimplemented. Manuscript uploads and embeddings are covered by the later foundation release entry below.

The prior integrated feature release (`8a823da`, Vercel deployment `dpl_E4HMzprKX6T6TyZNhSdXcxfbgLHT`) reached READY in production. Its hosted checks passed: owner access, saved Instagram shortcut persistence, a Michael agent blueprint saved/reloaded through the real database, password-settings visibility, then-disabled AI and pending-Meta states, desktop accessibility on four new pages, mobile overflow checks on six pages, and zero browser runtime errors. No real user password was changed by the test. The initial deployment error-log query returned no entries; no external log drain or ongoing monitor was configured. The GitHub Actions template remains inactive because the connected GitHub authorization lacks workflow scope; remote CI has not run.

## Hosted security advisor

The latest Supabase advisor result reports zero errors. Its warning is **Leaked Password Protection Disabled**: Supabase exposes that feature on the Pro plan, and this workspace currently uses Free without a purchased upgrade. Current-password verification and the application’s password-length rules remain active, but they are not a breached-password database check. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

The advisor also reports five informational RLS-with-no-policy findings on `private.workspace_generation_config`, `private.meta_connector_config`, `private.meta_credentials`, `private.meta_oauth_states`, and `private.meta_revocations`. This is intentional: clients must not read or change these server-only records. Administrative provisioning and narrowly guarded private functions handle them; no client policies were added.


## Manuscript foundation release — September 18, 2026

The repository audit and implementation sequence are in [docs/manuscript-upgrade-audit.md](docs/manuscript-upgrade-audit.md). The author/operator workflow and remaining scope are in [docs/manuscript-foundation.md](docs/manuscript-foundation.md).

The foundation extends The Universe with real book/series/audio metadata, private permission-approved manuscript uploads, versioned source passages, durable AI batch processing, persisted character observations and findings, optional vector indexing, exact source citations, spoiler controls, and free source-text search. Existing Desk review, drafts, sign-in and demo mode remain separate and supported.

Final release checks passed TypeScript, ESLint, 465 unit/API/database/schema tests in 31 files, and the production build after the hosted schema compatibility correction. The 20 selected connected desktop/mobile browser tests passed: manuscript creation/edit/upload/queued recovery/duplicate detection, cited findings, spoiler consent including a delayed-response race, source search, prior-version retention, existing book-to-Desk flow, draft protection, login/logout, persistence and accessibility. These browser tests use a simulated Supabase boundary and synthetic extraction fixtures; the actual provider is checked separately. Demo browser verification passed 18 tests initially and the remaining two on a focused rerun after accounting for Next.js's retained hidden route elements.

Adversarial review found and fixed EPUB inert-doctype compatibility, optional invalid vector handling, and delayed search results overriding spoiler consent. Exact citation validation, tenant boundaries, immutable source text, explicit reading retries, and prior-version activation rules remain enforced. The hosted database migration `202609190001_manuscript_intelligence.sql` applied transactionally and preserved all eight catalog books and six saved briefs.

The first hosted synthetic upload saved successfully; Google and Vertex rejected the initial complex output grammar with HTTP 400 before extraction usage was reported. A separate minimal live probe reproduced the error, then succeeded after simplifying the provider transport schema. Strict local and database validation remain required. The corrected deployment `dpl_7SYyDFMKaD2b9L99BshDYUa5nifJ` reached READY at the existing production alias. Retrying the same saved synthetic manuscript through the real UI succeeded and persisted four findings plus one character appearance. Findings survived reload; the citation opened the exact saved passage; text search returned the passage; identical re-upload reused the version; signing out restored 401 access denial. Desktop/mobile checks reported no browser errors or horizontal overflow once the resized layout settled. The Storage bucket was private and anonymous access to the original file was denied. The synthetic file, book, manuscript, findings, character and test processing records were removed afterward; the original eight books and six briefs remained.

The successful application extraction recorded 1,283 input tokens, 986 output tokens and 95 embedding tokens, with an estimated combined cost of $0.00466165. This excludes separate minimal debugging probes and is not a reconciled invoice. The test directly establishes text retrieval; the cleanup report aggregates embedding status across both the initial failed attempt and successful retry, so that aggregate is not evidence of vector-index health. Local SQL/provider tests separately verify vector shape/storage/retrieval and optional-index fallback. No real Cassy manuscript was supplied or analyzed.

This is the foundation increment. Goal-linked strategy briefs, owner/admin strategy review, dated release plans, automatic catalog recommendations and manuscript retrieval inside Ask Raven remain later increments; no automatic publishing or background execution is claimed.
