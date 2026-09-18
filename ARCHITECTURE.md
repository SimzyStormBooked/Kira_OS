# KIRA OS architecture

## Runtime

Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4, and locally owned shadcn/Radix primitives. Manrope and Cormorant Garamond are bundled locally. The interface uses charcoal, ivory, aged gold, and wine.

```text
Server layout → validated mode + verified workspace session
  ├─ demo → fresh demo snapshot
  └─ connected → user-scoped Supabase client → RLS-protected repository snapshot
                  ↓
          request-local WorkspaceProvider
          ├─ demo mutations → validated localStorage
          └─ connected mutations → PATCH /api/workspace
                                    → session + tenant authorization
                                    → validated command → caller-scoped SQL RPC
                                    → source / approval / feedback / audit event
                                    → freshly loaded private snapshot
```

The provider is instantiated per application tree and keyed by mode/signed-in account; private mutable state is not held in a process-wide singleton. It uses `useSyncExternalStore` with a stable initial server snapshot. Demo mode hydrates localStorage and listens for cross-tab updates. Connected mode receives its initial server snapshot, refreshes on focus, and reloads after mutations. It never writes private state to the demo storage key or falls back to demo records after an error.

## Learning and inspiration

The shell keeps working destinations visible and groups future modules under a collapsed “Coming later” section. `WorkspaceGuide` opens only on request; `ContextHelp` uses native expandable details. Optional first steps show actual shared brief/decision counts without presenting starter records as personal onboarding completion. Only a display preference is stored in `kira-os:guide-dismissed:v1`; storage failure does not block use.

Workspace search indexes page names/descriptions, sourced book titles, and authorized saved brief titles from the current snapshot. A saved-brief result uses `/desk?brief=<UUID>`; the Desk selects the matching pending/reviewed tab, scrolls to the record, and focuses its heading. Missing or unavailable records do not disclose another workspace's data.

`lib/data/inspiration.ts` contains fixed editorial business questions and source-linked public-domain literary quotes. The shelf moves only through explicit category, previous/next, or keyboard actions. Quotes retain attribution, source, and excerpt context; a server-selected date key keeps the displayed daily quote consistent during rendering. Neither feature calls a live model or generates fiction.

“Use this idea” navigates with an allowlisted idea ID, never private draft text in the URL. `ManualReviewForm` resolves known IDs into editable starters and requires an explicit save. A provider-owned in-memory scratchpad preserves unfinished words across internal navigation; replacing existing words requires a choice. Scratchpad fields are outside `workspaceSchema`, so they never enter localStorage, Supabase persistence, or workspace exports. Reload/sign-out discards them; a before-unload prompt warns while a draft remains. Only a submitted brief enters the ordinary saved-review flow.

`/learn` combines collapsed optional lessons with four curated agent recipes and a direct jump to the form. Name, goal, context, and success criteria produce a local text blueprint. Copying/downloading is explicit; “Save blueprint to my desk” uses the existing manual-review operation. Per-recipe notes, generated previews, and save/download signatures now live in provider-owned memory, along with the unsent Studio question and retry identity. They survive internal navigation, stay outside persistence/export schemas, and reset on account change or detected session loss. A shared before-unload check covers all three scratchpads. Explicit sign-out confirms discarding unfinished work and retains it if sign-out fails. Viewers can learn and export a blueprint without gaining write access; no recipe starts an agent.

Book detail pages lead with verified title, collection, listed order, and source. Empty/future sections are collapsed in connected mode. “Prepare book details” assembles a sourced, unsaved manual brief in the existing Desk scratchpad; an unfinished brief requires a keep/replace choice. Approved descriptions and material links can be collected there, but saving or approving the brief cannot mutate catalog fields or upload files.

`SetupStatus` reads AI and Meta status independently from authenticated GET routes, parses each result, and supports a read-only refresh. Setup account links appear only for the current workspace owner with confirmed permissions. Other roles get usable internal alternatives. Funding, model availability, Meta app configuration, and actual Meta authorization remain distinct states; a status refresh never purchases credits or authorizes an account.

## Authentication and authorization

`lib/config.ts` validates mode, Supabase URL/key, and author UUID. The default is demo only when mode is absent. Invalid mode or incomplete connected configuration closes private access. Production must explicitly set `KIRA_WORKSPACE_MODE=connected`.

`proxy.ts` refreshes cookie-backed Supabase sessions and marks connected responses private/no-store. Server access then verifies the user with Supabase Auth and requires the configured author record to be visible under RLS. Anonymous, unauthorized, unavailable, and unconfigured states are distinct. The proxy supplies the path header used to select the public sign-in surface; clients cannot choose that authorization bypass themselves.

`POST /auth/login` signs in existing email/password accounts. There is no public signup, OTP flow, or automatic invitation. Initial accounts must be created/confirmed by an administrator, with public signup disabled in Supabase. Cookie handling is server-side. Sign-in, sign-out, and workspace mutations enforce same-origin requests. Auth clients are session-bound and created per request; the app has no service-role key.

The server layout and `/api/workspace` each enforce access. RLS and caller-scoped SQL RPCs provide the final tenant boundary. Owner/editor/viewer permissions remain effective if a member calls PostgREST directly.

The workspace snapshot carries the verified role. UI controls reflect it, while every mutation still reauthorizes on the server. `/access` lets only the owner manage existing confirmed users through versioned SQL operations with append-only access events; it neither creates accounts nor sends invitations. `/api/account/password` verifies the current password using a nonpersistent client, checks the same user ID, installs a fresh HttpOnly session, then updates that account’s password.

## Directory map

- `app/`: pages, auth routes, workspace/Raven APIs, layout boundary, error states.
- `components/kira/`: shell, private home, login, manual brief form, catalog, approval desk, evidence drawers, demo intelligence, optional guidance, inspiration shelf, literary quotes, settings.
- `components/ui/`: owned shadcn primitives.
- `lib/auth/`: session verification, user-scoped client, same-origin/redirect checks, access errors.
- `lib/config.ts`: pure connection validation.
- `lib/db/`: per-provider demo/connected state, shared schemas, connected repository, compatibility contracts.
- `lib/ai/`: creative policy, deterministic-provider boundary, Studio contracts, and bounded Gateway adapter.
- `lib/agents/`: demo provider, prioritization, approval state machine.
- `lib/knowledge/`: provenance validation, origin propagation, safe evidence URLs.
- `lib/data/seed.ts`: sourced catalog and separately labeled demo/manual records.
- `lib/data/inspiration.ts`: curated business reflections and attributed literary quotes, independent of intelligence findings.
- `lib/connections/`: validated manual links and owner-consented Meta authorization/credential handling.
- `supabase/`: tenant/access/AI/connector migrations, demo seed, production catalog bootstrap, local configuration.
- `scripts/`: private local setup/check, seed/bootstrap generators, inactive CI template.
- `tests/`: business rules, SQL/RLS/RPC behavior, auth/API boundaries, browser workflows.

## Shared decisions and provenance

The connected repository uses explicit author filters in addition to RLS and excludes demo business records. It validates returned data and canonicalizes Postgres timestamp offsets to UTC. The API validates command shapes, limits body size, and derives author scope from the verified session.

`pending → approved` or `pending → rejected`. Editing increments version and remains pending. Approval/rejection opens a confirmation that explains finality and defaults keyboard focus to Cancel. The dialog retains the version originally reviewed and refuses a record changed while open. The decision RPC locks the row, checks the caller’s expected version, and rejects stale changes. Closed approvals cannot reopen. Approval identity, evidence, title, and review context remain immutable even through direct authenticated table updates.

Creating a manual brief atomically creates a member-attributed source, an evidence snapshot of the original text, and a pending approval. Later edits retain that source evidence. Triggers append actor/action/version audit events; members cannot forge or edit them. Lessons are append-only, tied to an approval, and attributed to the authenticated user. They do not train a model.

Queueing a stored recommendation copies its database provenance; clients cannot submit replacement evidence. Row locking prevents simultaneous queues from creating duplicate reviews. Approval records a decision only. No external executor exists.

## Raven and the creative boundary

`POST /api/raven` remains deterministic demo synthesis: it accepts no freeform prompt, reads seeded findings, enforces `lib/ai/policy.ts`, validates provenance, and returns a demo run plus recommendations. Connected mode does not execute or save demo Raven runs.

The prioritizer ranks three findings by `round(objective_weight × confidence × freshness)`. Weights are 90 for audience, 75 for catalog, and 65 for tactic. Freshness uses the oldest evidence timestamp, decays over 120 days, and is floored at 0.25; UUID ordering breaks ties. Confidence and examples are synthetic, not measured outcomes.

Ask Raven uses a separate `POST /api/studio` path behind `runStudioProvider`. It accepts only brainstorming, business-agent design, or learning jobs and a bounded question. A UUID and pending record are persisted before the model call. Private history and `/studio/[id]` retrieve the same record; repeating an ID never runs the model again. Ordinary navigation preserves the current request identity; an explicit new-question action resets it, protecting any different unsent draft. A delayed answer remains saved without navigating a person away from another page. Completed output can be copied to the Desk as a separate manual review brief with an AI label and source-answer path; the original generation stays unchanged.

The AI SDK `ToolLoopAgent` uses `google/gemini-3.8-flash` through Gateway, a strict structured output schema, one step, 3,000 output tokens, zero model retries, and a 45-second timeout. It has no tools, browser, catalog context, or external executor. Fixed system instructions enforce the creative boundary; supplied text is user data. Exact context excerpts are checked against the original question. Ideas remain unverified and require human review.

Generation RPCs require the caller’s owner/editor role and a server-only recording capability. Public invoker wrappers call private definer functions; only the key hash is stored in locked private configuration. Author-row locking enforces one pending call and 20 attempts per UTC day. Stale pending rows are marked interrupted when a later request begins. Completed/failed records are immutable and retain model, actor, timestamps, available token usage, estimated cost, and sanitized failure codes. A final database write may be retried once idempotently, never the model call.

`KIRA_AI_ENABLED=true`, valid recording configuration, and positive verified Gateway credit are required before submission. No demo/offline answer substitutes for an unavailable provider. Gateway funding and a direct Gemini 3.8 Flash model probe have succeeded. Production activation and a complete hosted question/result/persistence check remain pending; a provider probe alone does not verify those application boundaries.

Manual shortcuts never authorize accounts. The separate Meta implementation uses owner-initiated OAuth, scoped read permissions, encrypted private credentials, a server capability, account verification, and disconnect/deauthorization handling. It is not activated without Meta app configuration. Social metrics ingestion and publishing are not implemented. NotebookLM receives only text a person explicitly copies and pastes; there is no automatic document or account transfer.

## Current limits

Catalog UI records are bundled sourced metadata; bootstrap carries the matching database catalog. Field editing, private uploads, retrieval, embeddings, and social metrics ingestion remain future work. Covers are placeholders and unknown details remain unverified. Workspace JSON export covers review data, not AI history, access records, connectors, or private credentials.

Hosted Supabase provisioning, the core administrator sign-in/save/reload/separate-browser/sign-out workflow, and the prior integrated learning/access/link release are verified. The current adversarial UX fixes and AI activation still need their final deployment checks. Direct model connectivity is verified; hosted AI generation persistence and real Meta consent are not yet verified. [SETUP.md](SETUP.md) provides activation steps; [VERIFICATION.md](VERIFICATION.md) records actual checks.
