# Architecture — implemented Phase One

## Repository inspection

The supplied repository `SimzyStormBooked/Kira_OS` was inspected before changes: no commits, no package.json, no files, no existing configuration or documentation. It was cloned and scaffolded without replacing infrastructure. Work is limited to Phase One. Future-module routes are honest roadmap previews.

## Runtime and boundaries

Next.js 16 App Router + React 19 + strict TypeScript. Tailwind 4 and locally owned shadcn/ui Radix components provide accessible dialogs, sheets, tabs, forms, and actions. Manrope and Cormorant Garamond are bundled with the app. Lucide provides the icon system. The visual tokens use charcoal, ivory, aged gold, and wine.

```text
Server route pages → client interactive KIRA components
                         ├── versioned browser demo store → localStorage
                         │     approvals / feedback / dismissed moves / recommendations
                         └── POST /api/raven
                                  → policy gate (server-only)
                                  → IntelligenceProvider (demo implementation)
                                  → validate provenance → deterministic prioritizer
                                  → AgentRun + recommendations → validated client store
```

Server-only `lib/ai/provider.ts` is the model integration boundary. `models.ts` defines per-job model configuration. No provider call exists inside a React component; the client calls the Raven route. A future adapter must validate model outputs against the domain schemas and carry source evidence forward. It must not bypass the creative firewall.

## Directory map

- `app/`: routes, global design tokens, error/loading/not-found states, API boundary.
- `components/ui/`: generated and owned shadcn primitives.
- `components/kira/`: shell, metric cards, Raven briefing/art, recommendation cards, evidence drawer, agent status, universe/catalog, book details, approval desk, settings.
- `types/domain.ts`: Agent, AgentRun, AgentFinding, AgentRecommendation, Evidence, ApprovalRequest, HumanFeedback, Book, Series, Universe, TacticMemory; Zod schemas at mutation/persistence boundaries.
- `lib/data/seed.ts`: canonical seed shared by UI and SQL generation.
- `lib/agents/`: prioritizer, provider implementation and approval state machine.
- `lib/knowledge/`: provenance validation, origin propagation, safe evidence URLs.
- `lib/ai/`: policy, job-model configuration and server-only provider contract.
- `lib/db/`: browser demo store, server-only Supabase factory, future repository contract.
- `lib/analytics/`, `lib/connectors/`, `lib/seo/`: small extension contracts, without fake integrations.
- `supabase/`: two migrations, generated seed, local configuration.
- `tests/`: business invariants, SQL security/constraints, browser workflows and accessibility.
- `scripts/ci.yml.example`: inactive GitHub Actions template; activation awaits repository workflow permission.

## Raven ranking

The seed contains three specialist findings. Raven accepts only validated findings with evidence and declared source IDs, filters out reviewed/dismissed findings, and calculates review priority:

`priority = round(objective_weight × confidence × freshness)`

Weights are 90 (audience), 75 (catalog), 65 (tactic). Freshness decreases linearly from 1 with evidence age over 120 days, floored at 0.25; evidence freshness uses the oldest supporting source. UUID ordering breaks ties deterministically. This is an inspectable demonstration, not learned prioritization, market analysis, ROI, or outcome prediction. Confidence values are synthetic seed values. Demo output is always marked demo, including when one source is publicly verified.

The refresh endpoint uses fixed seed inputs, no request prompts, no paid APIs, and no external writes. It returns the actual completed run object. It does not pretend that disconnected specialists are working.

## Approval lifecycle

`pending → approved` or `pending → rejected`. Editing increments version and keeps `pending`. Reviewed decisions cannot be edited/reopened. Feedback can be appended before or after a decision and stays attached to the approval. “Prepare campaign” creates one review brief per recommendation, not a scheduled campaign. Approval does not verify unknown book fields or authorize a downstream executor. No executor exists.

The UI uses `useSyncExternalStore` with a stable server snapshot to avoid hydration mismatches. Saved state is schema-validated and versioned. Reload and cross-tab storage events rehydrate it. Saves fail visibly when browser storage is unavailable. Optimistic request versions guard sequential stale decisions; this local demo is not a transactional multi-user store. A future SQL adapter must update approvals with `WHERE version = expected_version` and detect zero updated rows. SQL also enforces version increments and final-state immutability.

## Provenance and origin

Every synthetic business record has `data_origin = demo`. Public catalog data carries a URL and verification date. Manual follower counts retain an unknown capture date. Unknown book facts stay null and render NEEDS VERIFICATION. Source excerpts distinguish synthetic examples from actual observations. No demo trope is attached to a real title. Decorative covers are explicitly placeholders.

## Creative firewall

`lib/ai/policy.ts` exports frozen default capabilities. Business analysis, approved-content repurposing, metadata, and outreach drafting are allowed by policy. Manuscript, chapter, scene, and fiction generation are prohibited. Repurposing requires approved source context. The policy gate runs at the server provider boundary; tests enforce every blocked capability. Allowed capabilities are architectural permission, not claims that all those features are implemented.

Future manuscript storage is read-only reference knowledge. `content_assets` and `knowledge_chunks` retain read-only constraints. Untrusted documents must never become agent instructions. The design has no fiction editor or creative generation route.

## Persistence decision

No Supabase credentials were provided. To make the full decision workflow usable immediately, the shipped UI explicitly uses browser-local demo persistence. The database schema is executed in automated tests, but no hosted database or authentication is enabled. We do not silently fall back from a claimed live mode. Settings always tells the truth: connections are not connected.

This is a deliberate vertical-slice boundary, not a simulation of cloud writes. The next slice replaces the store behind the repository contract after authenticated author scoping is implemented and tested.
