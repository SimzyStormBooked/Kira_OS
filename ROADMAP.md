# KIRA OS roadmap

## Phase 1 — Foundation (implemented)

Mission Control; premium responsive design system and navigation; verified starter catalog and detail sections; deterministic Raven synthesis with provenance; approval/edit/reject/teaching workflows; browser-local persistence/export/reset; creative firewall; Supabase schema and seed; automated logic, SQL and browser checks. Future modules have transparent previews, not working integrations.

Limits: demo runtime, no auth or cloud writes, no connected model, no autonomous specialists, no external execution, no learned feedback retrieval.

## Phase 2 — Vault + Knowledge Graph (next)

1. Supabase Auth, session renewal, owner/editor/viewer membership and an authenticated repository adapter.
2. Move approvals/feedback to shared storage with optimistic concurrency and an audit trail.
3. Upload owner-approved book metadata, official covers and read-only source documents to private Storage.
4. Hash/deduplicate sources; record provenance, rights, and field-level verification.
5. Cassandra resolves canonical series names and confirms metadata; no automated promotion of inferred facts.
6. Add read-only parsing, chunking, versioned embeddings, and citation-backed retrieval only after sources are approved.

Acceptance: an authenticated Cassandra can verify one real book, find its source paragraph, save a correction, and retrieve it from another device without changing Phase One domain contracts.

## Phase 3 — Reader Voice

Ingest permitted review exports. Separate quotations, sentiment, themes and inference; cite sources. Incorporate Cassandra's audience-fit feedback. No invented demographics or reader claims.

## Phase 4 — Social Intelligence

Connect authorized account history and measured metrics. Define comparable windows, detect missing data, analyze approved assets. Retain explicit manual snapshot lineage.

## Phase 5 — Discoverability

Read Search Console and approved website data. Produce sourced metadata/SEO recommendations for review. No fabricated rankings or direct site edits.

## Phase 6 — Campaign Intelligence

Link objectives, approved actions, existing assets and measured outcomes. Add real tactic memory comparisons and staleness signals. Avoid ROI claims without attribution evidence.

## Phase 7 — Hunt + Outreach

Research source-backed creators/reviewers/media; preserve relationship history and contact preferences. Draft business outreach for human approval. Actual sending requires a separately authorized implementation.

## Phase 8 — Attribution + Learning

Connect reliable attribution, comparable campaign results, feedback retrieval and learning loops. Track what worked, what declined, and what is unknown. Models may change; source history and human judgment remain durable.
