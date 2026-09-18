# KIRA OS verification

Recorded on 2026-09-17. The core private workspace is live at [KIRA OS](https://kira-os-dusky.vercel.app), backed by dedicated Supabase project `obusnqlwuoavwtmryiik`. Latest local work includes Learn & Create, access/password controls, persisted Ask Raven, saved links, and gated Meta authorization.

## Hosted core workflow — verified

Michael’s real email-confirmed administrator account signed in through the deployed app. A real business brief was saved in Supabase, survived reload, appeared in a separate browser session, and remained protected after sign-out. The browser reported no page errors during this workflow. The database contains eight sourced books and zero demo intelligence; public signup is disabled.

The Vercel runtime uses publishable/anon Supabase credentials and caller sessions. Seven privileged integration-injected secrets, including service-role/secret credentials and privileged database connection values, were removed from the runtime. No service-role key is required by the application.

These checks establish real hosted storage and authentication. They do not establish a working live AI model or a connected social account.

The Studio, access, and manual-links migrations have since been applied to the hosted database, and the private AI recording key/hash has been provisioned. The Meta migration, encryption key/capability hash, and the forward-only Studio validation migration are also applied. No Meta account is connected.

## Latest local checks

| Check | Result |
| --- | --- |
| Full `npm run check` | PASS: TypeScript, ESLint, 336 unit/API/database tests across 24 files, production build |
| Demo browser workflows | PASS: 20 tests on desktop and mobile |
| Connected browser workflows | PASS: 34 desktop/mobile tests against isolated simulated Supabase, including links, Studio setup, learning, access, password, and permission recovery |
| Studio boundary tests | PASS: same-origin/body limits, roles, pending-before-model ordering, idempotency, rate limits, recorded failure, and persistence-only retry |
| Studio SQL controls | PASS: tenant RLS, viewer denial, private recording capability, direct-write rejection, immutable final results, strict JSON/null checks, and source-excerpt checks |
| AI provider requests during local tests | Mocked; no live model calls made |
| Latest Meta regressions and integrated Connections/Studio browser checks | PASS: authorization replay/revocation/scope checks and Connections/Studio desktop/mobile flows |

All 54 browser tests passed across the demo and connected suites. Tests use Node 24.16, Next.js 16.3.5, React 19.3, Chromium desktop, and an emulated mobile viewport. Physical Safari has not been verified.

The simulated Supabase service is only browser-test infrastructure and is never imported by the application. PGlite separately executes actual SQL migrations with pgvector and emulated Auth primitives. It checks RLS, role isolation, provenance, expected versions, immutable decisions, and audit events; it does not replace a hosted provider test.

## Learning and first use

The curated idea shelf changes only on user input. It opens an editable brief without saving one. Literary quotes link to source texts and retain context. Optional guidance can be hidden/reopened, used with a keyboard, and dismissed with Escape.

Unfinished desk text survives internal navigation without entering localStorage, API writes, or review exports. Replacing existing words requires a choice. A delayed save clears only the submitted scratchpad revision. Learn & Create assembles a local blueprint from editable recipe fields, and saves only through its explicit desk action. Viewers can learn, copy, and download while server write permission remains closed.

## Provider activation still pending

Ask Raven’s runtime adapter is implemented but disabled. Gateway currently reports zero credits; Vercel asks the account owner to complete its card-verification step to unlock the displayed free allowance. The live probe returned HTTP 403. No successful live model output, cost deduction, or hosted generation completion has been verified. Keep `KIRA_AI_ENABLED=false` until funding, private recording configuration, and a controlled live test succeed.

Meta app credentials are missing. OAuth, encrypted credential storage, account verification, and disconnection code still require actual provider configuration and consent testing. Manual saved links and the NotebookLM copy bridge are separate from authorization or synchronization. Private uploads, embeddings, social metrics ingestion, and external publishing remain unimplemented.

The latest application/migration slice needs its final integrated deployment verification after the local checks complete. The GitHub Actions template remains inactive because the connected GitHub authorization lacks workflow scope; remote CI has not run.

## Hosted security advisor

The latest Supabase advisor result reports zero errors. Its warning is **Leaked Password Protection Disabled**: Supabase exposes that feature on the Pro plan, and this workspace currently uses Free without a purchased upgrade. Current-password verification and the application’s password-length rules remain active, but they are not a breached-password database check. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

The advisor also reports five informational RLS-with-no-policy findings on `private.workspace_generation_config`, `private.meta_connector_config`, `private.meta_credentials`, `private.meta_oauth_states`, and `private.meta_revocations`. This is intentional: clients must not read or change these server-only records. Administrative provisioning and narrowly guarded private functions handle them; no client policies were added.
