# Manuscript intelligence upgrade audit

Audit date: 2026-09-18. Baseline: `a578278`.

## Product evidence

Cassandra saved three member-attributed briefs on September 18: **30/60/90 Day New Release Plan**, **Revive Backlist**, and **Audio Book Promo**. The first asks for social/email activity 30, 60, and 90 days **before** release, targeting existing fans and new readers. The second asks for new-reader discovery between releases. The third asks for audiobook growth with minimal spend. These are user-supplied goals and catalog descriptions, not measured outcomes or manuscript-verified facts. Their existing text, source evidence, attribution, and pending decisions must remain intact.

The supplied specification also describes post-launch phases. Future plans must support an explicit anchor date and signed relative day offsets, so both pre-release and post-release plans work. Targets must be numeric, dated and editable; do not hardcode a preorder or review count.

## Existing architecture and reuse

| Area | Existing implementation | Required extension |
| --- | --- | --- |
| Application | Next.js App Router, React, existing dark author workspace and shadcn components | Extend The Universe and book detail; preserve demo mode separately |
| Authentication | Supabase verified user, caller-scoped SSR clients, fixed configured author, owner/editor/viewer, RLS | Apply identical guards to files, processing, citations and retrieval; never use runtime service role |
| Catalog | SQL books/series/universes/sources; UI currently imports eight sourced seed titles | Read actual authorized rows, allow private book metadata, update catalog navigation, search and home counts together |
| Knowledge | Read-only content assets, document sources, knowledge_chunks with vector(1536) | Private files, versioned manuscripts, safe parsing, durable chunks, locators, extraction and active-version retrieval |
| Characters | Existing characters and relationships | Stable per-book identity and versioned appearances; do not merge same-name characters across books without evidence |
| AI | Gateway, policy wrapper, strict structured output, durable Studio request/cost lifecycle | Separate manuscript job contract with bounded resumable batches; reuse recording capability and creative firewall |
| Briefs | approval_requests with evidence and versioned pending/approved/rejected decisions; attributed Teach Raven feedback | Future strategy/revision layer references existing approval snapshots; never reinterpret immutable historical decisions |
| Planning | Campaign identities and sourced tactic memory | Later goals, reader segments, brief revisions, dated plans/phases/tasks and measured results |

## Foundation schema changes

- Extend `books` with author-provided metadata and an active manuscript pointer. New books create attributed manual sources; known sourced records keep their origin.
- Add immutable manuscript versions referencing the existing book, document source and private asset. Record the uploader's permission, file checksum, parser version, size and processing state. Identical same-book uploads are idempotent; revisions retain history.
- Extend existing chunks with manuscript version and section locators. Use server-authorized writes and preserve cited text. Add a private Storage bucket with author/book/version paths and matching membership checks.
- Add durable manuscript batches before AI spending, immutable validated outcomes/usage, versioned book intelligence and character appearances. Activate a revision only after its full chunk set is processed; an older late completion cannot displace a newer active revision.
- Keep extracted information explicitly unreviewed. Each claim identifies supported information versus inference and contains an exact, validated chunk citation. Hide potential spoilers by default.

## Safe implementation sequence

1. Private dynamic catalog, add/edit metadata, series association and audiobook fields.
2. Permission-confirmed DOCX/PDF/EPUB/TXT/Markdown uploads with strict format, byte, expanded-archive and extracted-text limits. No remote resources, executable content or public manuscript links.
3. Durable chunked processing, embeddings, structured facts and character extraction, provenance inspection, version history and resume/retry.
4. Tenant-scoped active-version retrieval. A document is read once into persistent context; ordinary lookup never sends the full manuscript again.
5. Strategy increment: reader segments, flexible measurable goals, typed brief revisions/evidence and owner-only strategy review. Preserve existing ordinary Desk editor permissions. Default automatic approval off.
6. Planning increment: approved revision → goal/date anchor → 30/60/90 phases → existing campaigns → tasks → manually recorded or integrated results.
7. Catalog increment: evidence-backed cross-book matches, audiobook-specific strategies and opportunities; require actual performance evidence before claiming reader response exceeds a baseline.

## Boundaries and risks

- A manuscript is valuable private intellectual property. Permission to analyze is not permission to publish excerpts. Untrusted document text cannot change system instructions.
- A whole novel cannot safely depend on a single serverless request. This foundation uses persisted small batches and explicit page-driven resume; it does not claim an unattended worker exists.
- Paid extraction needs stable request IDs, no silent paid retry, bounded daily use, saved model/usage and sanitized failures. Embedding dimensions/model version must match stored vectors.
- Archive bombs, encrypted/unreadable PDFs, malformed containers, image-only scans and excessive text must fail with actionable errors, not partial successful intelligence.
- Extracted quotes establish traceability, not human verification. Inference and unknown information remain visibly separate from manuscript-supported candidates.
- Existing direct editor grants on chunk/asset tables need hardening for protected manuscripts; otherwise a browser token could forge provenance behind the API.
- Current deployments select one author through server configuration. RLS, storage and all joins must still be tested with two distinct authors; do not assume the configured singleton is tenant isolation.
- No supplied manuscript, release date or book-specific audio metadata is required to build the foundation. Production smoke tests must use clearly marked synthetic operator fixtures, never pretend a generated fixture is Cassandra's book.
- Google Drive import remains an adapter boundary. No Drive access or document transfer is implied by this upgrade.

## Verification

Use parser tests for all supported formats and malicious/oversized containers; SQL integration tests for role isolation, cross-author citations, private storage, idempotency, revision races and stable characters; route tests for body limits, origin/role guards and durable provider lifecycle; browser tests for add/upload/permission/progress/source/reload/mobile/accessibility. Run the repository's full check and relevant demo/connected regressions before release. Hosted verification is reported separately from local fixtures.
