# Database — Phase One

Two migrations establish 24 UUID-keyed tenant tables. Every application table enables RLS. Every record has timestamps; domain data carries origin. Tenant foreign keys include `author_id` to prevent cross-author links. Supabase owns `auth.users` and `auth.uid()`.

## Applied schema design

| Group                      | Tables                                                                          | Purpose                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Workspace                  | `authors`, `author_members`                                                     | Owner, editor, viewer access                                                                 |
| Provenance                 | `sources`                                                                       | Immutable source identity, URL, retrieval/capture timestamps, origin, metadata               |
| Catalog                    | `universes`, `series`, `books`                                                  | Author → organizational universe → collection → title, sourced fields and verification state |
| Knowledge graph foundation | `characters`, `relationships`, `tropes`, `themes`, `book_tropes`, `book_themes` | Source-backed future knowledge; no invented characters/tropes seeded                         |
| Assets / commerce          | `products`, `content_assets`                                                    | Product references, rights status, read-only asset references                                |
| Context                    | `social_accounts`, `campaigns`                                                  | Manual social snapshot and draft/reviewed campaign foundation                                |
| Agents                     | `agent_definitions`, `agent_runs`, `agent_findings`, `agent_recommendations`    | Agent identity, execution provenance, evidence-backed conclusions and priorities             |
| Human control              | `approval_requests`, `human_feedback`                                           | Versioned decisions, append-only lessons, writer identity                                    |
| Learning                   | `tactic_memory`                                                                 | Historical/recent observations, context, trend, confidence, status                           |
| Read-only retrieval        | `knowledge_chunks`                                                              | Sourced reference text, content hash, optional 1536-dimensional pgvector, embedding model    |

The second migration enables `vector` in `extensions`. Embeddings are nullable. There is no ingestion, similarity API, or ANN index yet. An index should be justified by corpus size and the selected embedding model.

## Relationships and provenance

The seed catalog links each book and series to its official source. `verified_fields` identifies the sourced subset; status remains partial. Descriptions and fictional knowledge remain null/empty. A source’s capture date may be unknown even when the time it was recorded is known.

Finding/recommendation/approval/tactic evidence is a nonempty JSONB array matching the TypeScript Evidence shape. Every item includes UUID, source UUID, source type/name, retrieval timestamp, excerpt/metric, metadata and origin. A trigger rejects missing/null provenance, cross-author/missing sources, mismatched origins, and non-demo conclusions built from demo sources. Finding source IDs must declare every evidence source. Evidence snapshots are embedded to preserve exactly what a decision used; `sources` is retained without authenticated UPDATE/DELETE policies. Future large raw payloads belong in private Storage, referenced by source hashes.

## Access control

- Owners can read/edit their author workspace and manage members.
- Editors can read/write domain data, but cannot grant access or change author ownership.
- Viewers can read only.
- Anonymous callers have no table grants or policies.
- RLS helpers are stable SECURITY DEFINER functions in a non-exposed `private` schema with an empty search path. Only authenticated callers have execution grants. This avoids recursive membership policies.
- Human feedback is append-only and insert policy binds `user_id` to `auth.uid()`.
- Sources, agent history and approvals have no authenticated DELETE policies.
- Closed approvals are immutable. New approvals must start pending at version zero; updates must increment version by one.
- The web application never uses a service-role key.

Approval updates must also use an expected-version predicate; the trigger alone cannot detect a client's stale full-record read when a caller supplies the latest version. Browser persistence is an isolated demonstration; live database integration is not yet wired.

## Seed

`npm run db:seed:generate` creates deterministic SQL from `lib/data/seed.ts`. The seed includes one manually supplied author, one organizational collection, six sources, three collections, eight verified title/order records, one manual Instagram snapshot, six demo agent definitions, three demo findings/recommendations, three pending approval examples and one empty-performance tactic memory sample. No auth users, credentials, embeddings, fictional details, review bodies, sales, or actual performance are invented.

The owner UUID is deliberately null. Claim the local seed author using an existing auth user only after explicit local setup (README). Seed statements use conflict-do-nothing for their deterministic primary IDs. Do not treat the seed as a production data migration.

## Deferred entities

These are intentionally not empty production tables yet; their ingestion and consent rules need real inputs:

- `social_posts`, `social_metrics`: Phase 4; author/account/source, observation time, metric definitions.
- `reader_reviews`, `reader_feedback`, `reader_segments`: Phase 3; book/source, collection permission, deduplication, consent for personal information.
- `campaign_actions`, `campaign_results`: Phase 6; campaign/approval, channel, measured outcomes and measurement window.
- `keywords`, `search_queries`, `seo_pages`: Phase 5; source/search-console property, page, capture time and verified metrics.
- `creators`, `media_contacts`, `outreach_targets`, `outreach_interactions`, `opportunities`: Phase 7; provenance, relationship history, human approvals, contact preferences.

All future entities inherit author scoping, UUIDs, timestamps, origin and provenance. This avoids brittle speculative columns while preserving clean core relationships.

## Validation

`tests/database.test.ts` executes both migrations and the generated seed in PGlite with real pgvector support. Supabase auth roles/functions are emulated locally. It checks owner/editor/viewer/outsider behavior, cross-author foreign keys, null and fabricated provenance, approval history, feedback attribution, and snapshot truth. Hosted Supabase/PostgREST/Auth/Storage verification remains part of the next connected slice.
