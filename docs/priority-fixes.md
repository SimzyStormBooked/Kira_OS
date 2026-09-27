# Author workspace priorities

This is a branch-level implementation and release checklist for `feat/author-workspace-priorities`. It does not establish that the changes have been deployed, that migrations have been applied to a hosted database, or that a provider connection works. The release coordinator must record those outcomes after verification.

## Implemented in this branch

| Priority | Author outcome | Implementation boundary |
| --- | --- | --- |
| High | Find older Raven questions and answers | History supports bounded pages, search and stable saved-answer links. Opening history does not submit a new question. Database retrieval remains scoped to the verified workspace. |
| High | Find a saved character or Raven answer from workspace search | Results distinguish characters, saved answers, books, briefs and workspace destinations. Page descriptions and Guide share a public navigation inventory. Retrieval does not place manuscript passages or full answer bodies into the global result list. |
| High | Maintain an existing character profile | Profile details, author notes and manuscript links have explicit editing flows, conflict checks and source review. Extracted identity remains distinct from author-confirmed profile identity. A matching name alone does not link characters across books. |
| Medium | Continue from saved work on Home | A small private endpoint returns the last completed Raven answer and two recently updated books with their latest manuscript progress. Dates say **Saved** or **Book updated**; the product does not claim these are recently viewed records. Refresh happens on entry, window focus and an explicit Refresh action. |
| Medium | Enter a completed book through its knowledge | Reading status precedes book metadata, completed knowledge has an **Explore what Raven learned** link, and adding another manuscript version is collapsed when completed knowledge exists. The original upload permission, permanence and separate reading action remain intact. |
| Medium | Return to the selected book knowledge view | Character, Story Arc and Marketing selections are represented by `knowledge=characters`, `knowledge=story` or `knowledge=readers` in the URL. This preference does not enable spoilers or alter saved knowledge. |
| Medium | Start from an author goal | Optional first steps offer **Understand a book**, **Plan book marketing** and **Review Facebook ads**. Book and marketing links use an available completed book when one exists; otherwise they lead to the library. Shared briefs and decisions remain clearly labeled as shared work. |
| Medium | Find every active destination in Guide | Guide includes Character Studio, Ads, Catalog Opportunities, Marketing Plans and the other active destinations. Owner access is role-aware. Six future destinations are grouped as previews with their limits stated. |
| Small polish | Know which Ads CSV is selected | Selection has one visible filename/size summary and a **Replace CSV file** action. Files smaller than 1 KB show their actual byte count. Parsing, validation, import permission and save behavior are unchanged. |

Navigation metadata is in [workspace-navigation.ts](../lib/workspace-navigation.ts). Home summary fields and labels are in [workspace-resume.ts](../lib/workspace-resume.ts); the [resume endpoint](../app/api/workspace/resume/route.ts) checks the session and current role, scopes each read by author ID and returns private/no-store responses. It does not load prompts, manuscript text or full answers. Summary records stay in component memory and are hidden when workspace readiness or the session is lost; no private activity analytics or browser history store is added.

## Export work and existing custody limits

The expanded data export is being integrated separately in this branch. Until its implementation, tests and release status are recorded, treat the existing export as a **briefs, decisions, lessons and recommendation-state export**, not a complete account backup. Refer to the actual export manifest and its exclusions once that work is finished. Never describe an unverified export as restorable.

Manuscript custody currently offers per-version original-file downloads and an attributed removal-request brief. Recording that request does not remove the file, parsed passages, embeddings or derived knowledge. The application has no completed manuscript-deletion workflow, including for the owner. Existing owner access controls can revoke a member's access while retaining saved workspace records; revocation is not account deletion or content erasure.

An operator handling account or manuscript custody should:

1. Verify the requesting person, their workspace and the exact account, book and manuscript versions involved. Use record IDs and dates in the case notes; do not copy manuscript text, credentials or private sign-in links into logs.
2. State what the available action changes. Access removal, password recovery, original-file download and a removal-request brief are distinct actions. Ask the author to keep needed drafts/downloads before a change that would end their access.
3. For access changes, use the owner controls for existing confirmed accounts and verify the result in a separate authenticated session. The app does not create accounts or send invitations. Private recovery links follow the [existing welcome-link runbook](private-welcome.md) and are credentials, not general share links.
4. For a removal request, preserve its attributed record and identify source files, passages, embeddings, completed knowledge, character source links, saved answer context and plan evidence that may depend on the source. Pause active reading and allow in-flight work to settle before any separately reviewed maintenance operation. Do not bypass source or audit guards to make a request appear complete.
5. Close the request only after an authorized, reviewed removal process has verified both database and private storage outcomes, access to dependent records, retained audit requirements and the stated handling of backups. Record what remains and why. This closure process still needs implementation and an exercised runbook.

For current source and worker details, see [manuscript foundation](manuscript-foundation.md) and [background reading](background-manuscript-reading.md).

## Verification status

Focused daily-workspace checks completed locally:

- ESLint for the changed daily UI, navigation inventory, resume endpoint/contracts and new tests passed.
- TypeScript `tsc --noEmit` passed after the initial daily-workspace changes. Final integrated type generation and typecheck remain part of the coordinator's checks.
- `tests/workspace-resume.test.ts` and `tests/ads-csv.test.ts`: 44 tests passed. The resume tests cover caller scope, metadata-only responses, authorization loss, sanitized failure and truthful reading labels.
- New `tests/e2e-connected/daily-workspace.spec.ts` is ready for desktop/mobile verification: Home links, selected knowledge view across reload, replacement upload disclosure, goal links, Guide/previews and sub-KB CSV selection.

The coordinator still must run and record the complete lint/typecheck/unit/database/build checks, connected desktop/mobile flows and relevant existing browser regressions. The completed-manuscript replacement test must expand **Add another manuscript version** before interacting with the replacement form. Authentication loss, viewer access, browser focus, narrow layouts and accessibility should be covered in the final integrated run. Each feature owner's additional test results belong in the release record; this page is not a substitute for them.

Hosted acceptance is separate: apply the matching reviewed migrations, deploy the matching app, verify sign-in and saved-data reload, confirm source links and access boundaries using the hosted environment, and record the actual deployed revision. No production completion claim is made here.

## Commercial readiness gates

The workspace remains a private author deployment. The following are release gates for broader paid use, not implemented features or promises:

| Gate | Evidence needed before calling it ready |
| --- | --- |
| Unified spending control | A workspace-level dollar budget across text generation, manuscript reading, portraits, Workflow usage and other paid operations; atomic reservations, visible remaining allowance and safe behavior after timeouts/retries. Per-feature request counts and cost estimates are not a unified dollar cap. |
| Tenant onboarding and lifecycle | A supported tenant provisioning flow, verified owner assignment, isolated configuration, account recovery, membership changes, ownership transfer and offboarding. The configured author ID and existing-user grant flow are not self-serve multi-tenant onboarding. |
| Billing and entitlements | An implemented payment/subscription lifecycle, server-enforced entitlements, cancellation/refund/support behavior and tests for concurrent or stale entitlement changes. This branch does not add billing. |
| Backup and restore | Documented coverage of database rows and private storage, a separate-environment restore drill with measured recovery outcomes, and checks that relationships, citations and permissions survive restore. Downloading JSON or an original manuscript is not this drill. |
| Deletion closure | An author-facing request status and operator process that consistently handles files, derived records, active jobs, audit retention and backups, with verification and an attributable completion record. The current request brief is only the intake step. |
| Monitoring and response | Named operational ownership, actionable alerts, safe structured error reporting, provider/job failure detection, permission-loss handling, incident triage and tested recovery. Alerts must exclude manuscripts, questions, answers, tokens and credentials. |
| Provider activation | Real consent, required service credentials, funded usage and hosted end-to-end checks for each enabled provider. A configured UI or mock/fixture pass does not prove Meta, Google, email delivery or AI availability. Email-provider acceptance is not confirmed inbox delivery. |
| Data handling and customer agreement | A published, accurate account of shared-workspace access, subprocessors, permissions, exports, retention/deletion limits, support and service expectations that matches the deployed behavior. Existing manuscript permission does not grant publishing rights. |
| Operating limits and support | Exercised concurrency/latency limits, capacity and cost observations, clear plan limits, supported import formats, recovery guidance and a support route for failed paid work. No unsupported performance or autonomous-marketing claims. |

Existing role checks, RLS, server-side creative boundaries, explicit consent and provenance are foundations to preserve through these gates. They do not by themselves establish a complete commercial service.
