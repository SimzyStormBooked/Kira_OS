# KIRA OS roadmap

## Phase 1 — Foundation (implemented)

Responsive author workspace, sourced starter catalog, deterministic demo Raven, provenance, approval/edit/reject/teaching workflows, browser-local demo persistence/export/reset, creative firewall, database schema, and automated checks. Future modules are transparent previews.

## Connected foundation — implemented, hosted verification pending

Existing-account Supabase email/password auth, server-side sessions, owner/editor/viewer access, request-local workspace provider, private Mission Control, and authenticated shared briefs/decisions/lessons. SQL RPCs enforce expected versions and preserve source evidence; triggers retain actor/version audit events. Manual business briefs make the workspace useful before live intelligence exists.

Launch work: accept the Supabase integration terms in Vercel; provision the dedicated resource in `storm-booked/kira-os`; apply migrations and production bootstrap; create an email-confirmed administrator/owner; verify deployed sign-in, save/reload across browsers, and sign-out. Explicit connected mode must fail closed until setup succeeds. See [SETUP.md](SETUP.md).

No live models, autonomous specialists, publishing, outreach sending, spending, or learned feedback retrieval are enabled.

## Phase 2 — Vault + Knowledge Graph (next product slice)

1. Upload approved metadata, official covers, and read-only documents to private Storage.
2. Hash/deduplicate sources and record provenance, rights, and field verification.
3. Let Cassandra resolve series names and confirm metadata; keep inferred facts unverified.
4. Add read-only parsing, versioned embeddings, and citation-backed retrieval after approval.

Acceptance: Cassandra verifies a real book field, finds its source passage, saves a correction, and retrieves it from another device. Her fiction remains authored by her.

## Phase 3 — Reader Voice

Ingest permitted review exports. Separate quotations, sentiment, themes, and inference; cite sources. Retrieve Cassandra’s audience-fit lessons. Avoid invented demographics or reader claims.

## Phase 4 — Social Intelligence

Connect authorized account history and measured metrics. Define comparable windows, identify missing data, and analyze approved assets. Preserve manual snapshot lineage.

## Phase 5 — Discoverability

Read authorized Search Console and website data. Produce sourced metadata/SEO recommendations for review. Rankings require evidence; site edits require a separately authorized implementation.

## Phase 6 — Campaign Intelligence

Link objectives, approved actions, existing assets, and measured outcomes. Add comparable tactic history and staleness signals. ROI claims require attribution evidence.

## Phase 7 — Hunt + Outreach

Research source-backed creators/reviewers/media, retain history and contact preferences, and draft business outreach for review. Sending requires a separately authorized implementation.

## Phase 8 — Attribution + Learning

Connect reliable attribution, comparable results, and feedback retrieval. Track what worked, what declined, and what remains unknown. Models may change; source history and human judgment remain durable.
