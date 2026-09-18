# KIRA OS verification

Updated after the first adversarial UX review and production AI activation. Release `562c108` is READY at [KIRA OS](https://kira-os-dusky.vercel.app), backed by dedicated Supabase project `obusnqlwuoavwtmryiik`. Vercel deployment `dpl_5d3psvQaerzRGgC2vjEASMHbwBXy` ([deployment URL](https://kira-8offqrgs9-storm-booked.vercel.app)) is aliased to the canonical site. The deployed release includes the reviewed UX fixes, live Ask Raven, Learn & Create, access/password controls, saved links, and gated Meta authorization.

## Hosted core workflow — verified

Michael’s real email-confirmed administrator account signed in through the deployed app. A real business brief was saved in Supabase, survived reload, appeared in a separate browser session, and remained protected after sign-out. The browser reported no page errors during this workflow. The database contains eight sourced books and zero demo intelligence; public signup is disabled.

The Vercel runtime uses publishable/anon Supabase credentials and caller sessions. Seven privileged integration-injected secrets, including service-role/secret credentials and privileged database connection values, were removed from the runtime. No service-role key is required by the application.

These core checks establish real hosted storage and authentication. The real deployed AI workflow is recorded separately below; no Meta account has been connected.

The Studio, access, and manual-links migrations have since been applied to the hosted database, and the private AI recording key/hash has been provisioned. The Meta migration, encryption key/capability hash, and the forward-only Studio validation migration are also applied. No Meta account is connected.

## Current local release checks

| Check | Result |
| --- | --- |
| Full `npm run check` | PASS: TypeScript, ESLint, 336 unit/API/database tests across 24 files, production build |
| Demo browser workflows | PASS: 20 tests on desktop and mobile |
| Connected browser workflows | PASS: 74 desktop/mobile tests against isolated simulated Supabase, including links, Studio setup, learning, access, password, draft retention, decisions, search, async recovery, and permission recovery |
| Studio boundary tests | PASS: same-origin/body limits, roles, pending-before-model ordering, idempotency, rate limits, recorded failure, and persistence-only retry |
| Studio SQL controls | PASS: tenant RLS, viewer denial, private recording capability, direct-write rejection, immutable final results, strict JSON/null checks, and source-excerpt checks |
| AI provider requests during local tests | Mocked; no live model calls made |
| Latest Meta regressions and integrated Connections/Studio browser checks | PASS: authorization replay/revocation/scope checks and Connections/Studio desktop/mobile flows |

All 94 browser tests passed across the demo and connected suites after the final source changes. Tests use Node 24.16, Next.js 16.3.5, React 19.3, Chromium desktop, and an emulated mobile viewport. Physical Safari has not been verified.

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

The new regressions passed in the complete 74-test connected suite. They use the isolated fixture and mocked AI/Meta responses. Two initial failures were test-harness issues (awaiting a canceled reload and querying a dialog-hidden heading); both were corrected before the successful complete rerun. The real hosted AI workflow below also passed; a broader audit across 18 hosted page/viewport combinations is still running and is not yet included as a completed result.

## Live production AI workflow — verified

The owner funded AI Gateway, and a direct connectivity probe against `google/gemini-3.8-flash` succeeded. The observed funding balance was $15 before the later application check; it is not a claim about the remaining balance after usage. Production now has `KIRA_AI_ENABLED=true` with the recording capability configured.

A real question was submitted through the production UI and completed as generation `be99db77-8aa8-442e-888f-33563b9e6bd3`. Its saved answer survived reload. Explicitly choosing **Save answer to my desk** created attributed brief `0425c388-24c5-4ba3-8ea8-279338955d87`, which remained pending for human review; the saved state and repeat-save prevention survived reload. Sign-out then restored a 401 response from private API access.

The generation recorded 1,018 input tokens and 1,078 output tokens, with an estimated model cost of **$0.004806**. This is the application's estimate, not a reconciled provider invoice. The hosted check establishes the real UI → authenticated API → model → durable answer → review-brief flow. It does not activate autonomous agents, background research, social synchronization, publishing, or message sending.

Meta app credentials are missing. OAuth, encrypted credential storage, account verification, and disconnection code still require actual provider configuration and consent testing. Manual saved links and the NotebookLM copy bridge are separate from authorization or synchronization. Private uploads, embeddings, social metrics ingestion, and external publishing remain unimplemented.

The prior integrated feature release (`8a823da`, Vercel deployment `dpl_E4HMzprKX6T6TyZNhSdXcxfbgLHT`) reached READY in production. Its hosted checks passed: owner access, saved Instagram shortcut persistence, a Michael agent blueprint saved/reloaded through the real database, password-settings visibility, then-disabled AI and pending-Meta states, desktop accessibility on four new pages, mobile overflow checks on six pages, and zero browser runtime errors. No real user password was changed by the test. The initial deployment error-log query returned no entries; no external log drain or ongoing monitor was configured. The GitHub Actions template remains inactive because the connected GitHub authorization lacks workflow scope; remote CI has not run.

## Hosted security advisor

The latest Supabase advisor result reports zero errors. Its warning is **Leaked Password Protection Disabled**: Supabase exposes that feature on the Pro plan, and this workspace currently uses Free without a purchased upgrade. Current-password verification and the application’s password-length rules remain active, but they are not a breached-password database check. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

The advisor also reports five informational RLS-with-no-policy findings on `private.workspace_generation_config`, `private.meta_connector_config`, `private.meta_credentials`, `private.meta_oauth_states`, and `private.meta_revocations`. This is intentional: clients must not read or change these server-only records. Administrative provisioning and narrowly guarded private functions handle them; no client policies were added.
