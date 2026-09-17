# Phase One verification

Verified locally on 2026-09-17 with Node 24.16.0, Next.js 16.3.5, React 19.3.0, and Chromium 153 via Playwright.

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS — generated route types + strict TypeScript |
| `npm run lint` | PASS — zero errors/warnings |
| `npm test` | PASS — 41 tests in 3 suites |
| `npm run build` | PASS — optimized production output, 24 generated pages |
| `npm run test:e2e` | PASS — 16 cases across desktop and mobile |
| Automated accessibility | PASS — axe WCAG 2 A/AA and 2.1 AA tags on Mission Control, Universe, Desk and Settings at both sizes |
| Production dependency audit | PASS — zero reported vulnerabilities |
| SQL migrations | PASS — both unmodified migrations + seed executed in PGlite with pgvector |
| Production browser smoke | PASS — content/controls render; no reported browser errors |
| Production HTTP smoke | PASS — home 200, unknown route 404, Raven POST 200 with 3 demo recommendations |

## Verified stories

- Mission Control labels all six synthetic metrics DEMO and separates the supplied manual Instagram snapshot.
- Evidence drawer exposes the exact synthetic sample and its provenance; it closes normally.
- Prepare campaign → edit brief → teach Raven → approve → reload → reviewed history retains edited text and human guidance. JSON export downloads successfully.
- Rejection persists. Setting aside a Raven recommendation removes it; restore makes it available again.
- Refresh reaches `POST /api/raven`, passes the server provider gate, and returns a completed demo run plus three source-backed recommendations.
- Book search and series filters work; detail tabs preserve NEEDS VERIFICATION for unknown characters and other unimported information.
- Official purchase/source links point to the checked author collection pages.
- Global search and mobile navigation work. Tested mobile pages do not overflow horizontally.
- Every future module clearly states that it is a roadmap preview. Unknown URLs return HTTP 404.

## Business and database invariants

Ranking is deterministic, source-age aware and excludes dismissed/reviewed findings. Missing evidence, undeclared sources and origin laundering fail validation. Fiction capabilities are denied before provider invocation. Provider output cannot replace source excerpts or relabel demo intelligence. Approval edits remain pending; final decisions are immutable and versioned. Feedback is required, length-limited, retained and scoped. No external executor exists.

Database roles prove owner/editor/viewer behavior and outsider isolation. Tenant foreign keys block cross-author references. SQL provenance rejects missing sources and null source fields. Approval history and sources cannot be deleted by authenticated users. Feedback attribution rejects another user's UUID. Manual snapshot capture time remains null, and social accounts are explicitly not live.

## Issues found and fixed

- A removed Lucide brand icon was replaced with a consistent camera icon.
- Vitest 5 compatibility was corrected during the initial test setup.
- Cassandra's Desk tab triggers were connected to real tab panels, resolving an ARIA control-target violation.
- Unknown dynamic routes were constrained to generated parameters, resolving a streamed not-found page with an incorrect HTTP 200.
- Modal edits capture the version they opened with, preventing an already-refreshed approval version from masking a stale editor draft.

## Scope of verification

Tests ran against the local application and embedded PostgreSQL, not a hosted Supabase project. PGlite uses actual Postgres and pgvector but emulates Supabase's auth roles, users and UID helper; this does not verify hosted Auth, PostgREST, Storage or OAuth. Browser tests use Chromium desktop and a mobile viewport/device profile, not physical iOS Safari. Automated accessibility checks do not replace a complete assistive-technology review.

No live model, social API, manuscript ingestion, external publishing or remote deployment was enabled. Those capabilities are outside Phase One. An inactive GitHub Actions template is included at `scripts/ci.yml.example`. The current OAuth connection lacks `workflow` scope, so GitHub rejected the first push with an active workflow. The application was pushed with the template outside the workflows directory; an administrator can activate it later. Remote CI has not run.
