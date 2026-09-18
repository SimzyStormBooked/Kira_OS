# KIRA OS verification

Verified locally on 2026-09-17 using Node 24.16, Next.js 16.3.5, React 19.3 and Chromium.

| Check | Result |
| --- | --- |
| TypeScript and ESLint | PASS, no warnings |
| Unit, API, auth, setup and embedded database tests | PASS, 157 tests across 9 suites |
| Production build | PASS |
| Demo browser suite | PASS, 16 desktop/mobile cases |
| Connected browser suite | PASS, 8 desktop/mobile cases against a local simulated Supabase service |
| Automated accessibility | PASS on demo primary pages, private login and connected home |
| Production dependency audit | Zero reported vulnerabilities |
| Deployment upload inspection | Environment files and test recordings excluded |
| Vercel production build | READY |
| Public hosted access check | PASS: home redirects to login; setup screen loads; private API returns 503 while unconfigured; no private shell or shared caching |

## Verified private workflow

The production Next app exercised its normal Supabase SDK, session, repository and API paths against an isolated loopback service. Sign-in rejects invalid credentials and nonmembers. An authorized user can create a manual business brief, edit it, attach guidance, approve it, reload, export and sign out. Private pages then require sign-in. Cookies are HttpOnly with SameSite=Lax, responses disallow shared caching, and private state is absent from localStorage. Both desktop and mobile views fit the viewport and render without reported page errors.

The simulated service is only browser-test infrastructure; it is never imported by the application. It proves browser-to-API wiring, not hosted Supabase availability or security. PGlite independently executes all three SQL migrations with real pgvector, RLS, role isolation, tenant foreign keys, source provenance, optimistic versions, immutable final decisions and audit history. These tests also check direct table updates cannot rewrite an approval's original evidence or approve a changed draft without a separate review.

## Verified demo workflow

Demo dashboard data stays labeled. Prepare, edit, teach, approve/reject, dismiss, restore, export and reload work. Raven refresh crosses the server provider boundary and returns only sourced demo output. Catalog search, filters, fourteen detail sections, global search, mobile navigation and unknown-route handling work. Unknown book details remain unverified.

## Issues found and resolved

- Next normalizes loopback Request URLs to localhost. Same-origin validation now uses the configured canonical origin or a validated actual Host, without trusting forwarded-host input; logout redirects preserve the current origin.
- Pending approval evidence could previously be changed by direct table updates. Migration 003 makes original evidence and review context immutable and separates draft edits from approval.
- Expired or revoked sessions now clear private client state and return to sign-in after an authorization failure.
- Deployment inspection found local browser recordings among upload candidates. `.vercelignore` now excludes them and environment files.

## Hosted verification remains pending

The Vercel production deployment is ready at https://kira-os-dusky.vercel.app. Supabase provisioning requires marketplace terms acceptance. No hosted Supabase database, administrator or real cross-device save has been verified. A deployed setup screen is not a working private database. Finish provisioning, apply migrations and the non-demo bootstrap, assign the confirmed administrator, and test a real save/reload and sign-out before inviting Cassie.

Live AI providers, social APIs, private document ingestion and external publishing remain unconnected. Browser coverage uses Chromium desktop and an emulated mobile viewport, not physical Safari. The GitHub Actions template remains inactive because the current GitHub OAuth connection lacks workflow scope; remote CI has not run.
