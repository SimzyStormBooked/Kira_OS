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

The provider is instantiated per application tree; private mutable state is not held in a process-wide singleton. It uses `useSyncExternalStore` with a stable initial server snapshot. Demo mode hydrates localStorage and listens for cross-tab updates. Connected mode receives its initial server snapshot, refreshes on focus, and reloads after mutations. It never writes private state to the demo storage key or falls back to demo records after an error.

## Authentication and authorization

`lib/config.ts` validates mode, Supabase URL/key, and author UUID. The default is demo only when mode is absent. Invalid mode or incomplete connected configuration closes private access. Production must explicitly set `KIRA_WORKSPACE_MODE=connected`.

`proxy.ts` refreshes cookie-backed Supabase sessions and marks connected responses private/no-store. Server access then verifies the user with Supabase Auth and requires the configured author record to be visible under RLS. Anonymous, unauthorized, unavailable, and unconfigured states are distinct. The proxy supplies the path header used to select the public sign-in surface; clients cannot choose that authorization bypass themselves.

`POST /auth/login` signs in existing email/password accounts. There is no public signup, OTP flow, or automatic invitation. Initial accounts must be created/confirmed by an administrator, with public signup disabled in Supabase. Cookie handling is server-side. Sign-in, sign-out, and workspace mutations enforce same-origin requests. Auth clients are session-bound and created per request; the app has no service-role key.

The server layout and `/api/workspace` each enforce access. RLS and caller-scoped SQL RPCs provide the final tenant boundary. Owner/editor/viewer permissions remain effective if a member calls PostgREST directly.

## Directory map

- `app/`: pages, auth routes, workspace/Raven APIs, layout boundary, error states.
- `components/kira/`: shell, private home, login, manual brief form, catalog, approval desk, evidence drawers, demo intelligence, settings.
- `components/ui/`: owned shadcn primitives.
- `lib/auth/`: session verification, user-scoped client, same-origin/redirect checks, access errors.
- `lib/config.ts`: pure connection validation.
- `lib/db/`: per-provider demo/connected state, shared schemas, connected repository, compatibility contracts.
- `lib/ai/`: creative policy, job-model configuration, server-only intelligence provider interface.
- `lib/agents/`: demo provider, prioritization, approval state machine.
- `lib/knowledge/`: provenance validation, origin propagation, safe evidence URLs.
- `lib/data/seed.ts`: sourced catalog and separately labeled demo/manual records.
- `supabase/`: three migrations, demo seed, production catalog bootstrap, local configuration.
- `scripts/`: private local setup/check, seed/bootstrap generators, inactive CI template.
- `tests/`: business rules, SQL/RLS/RPC behavior, auth/API boundaries, browser workflows.

## Shared decisions and provenance

The connected repository uses explicit author filters in addition to RLS and excludes demo business records. It validates returned data and canonicalizes Postgres timestamp offsets to UTC. The API validates command shapes, limits body size, and derives author scope from the verified session.

`pending → approved` or `pending → rejected`. Editing increments version and remains pending. The decision RPC locks the row, checks the caller’s expected version, and rejects stale changes. Closed approvals cannot reopen. Approval identity, evidence, title, and review context remain immutable even through direct authenticated table updates.

Creating a manual brief atomically creates a member-attributed source, an evidence snapshot of the original text, and a pending approval. Later edits retain that source evidence. Triggers append actor/action/version audit events; members cannot forge or edit them. Lessons are append-only, tied to an approval, and attributed to the authenticated user. They do not train a model.

Queueing a stored recommendation copies its database provenance; clients cannot submit replacement evidence. Row locking prevents simultaneous queues from creating duplicate reviews. Approval records a decision only. No external executor exists.

## Raven and the creative boundary

The only implemented intelligence provider is deterministic demo synthesis. `POST /api/raven` accepts no freeform prompt, reads seeded findings, enforces `lib/ai/policy.ts`, validates provenance, and returns a demo run plus recommendations. Connected mode does not execute or save demo Raven runs.

The prioritizer ranks three findings by `round(objective_weight × confidence × freshness)`. Weights are 90 for audience, 75 for catalog, and 65 for tactic. Freshness uses the oldest evidence timestamp, decays over 120 days, and is floored at 0.25; UUID ordering breaks ties. Confidence and examples are synthetic, not measured outcomes.

Future models belong behind `lib/ai/provider.ts`; no model SDK call belongs in a React component. Business analysis and approved-content repurposing are allowed capabilities, not claims that adapters exist. Fiction generation remains prohibited. Imported material is data, never agent instructions; future manuscripts are read-only references.

## Current limits

Catalog UI records are bundled sourced metadata; bootstrap carries the matching database catalog. Field editing, private uploads, retrieval, embeddings, social connectors, and live model adapters remain future work. Covers are placeholders and unknown details remain unverified.

Connected code and local tests are implemented. Hosted Supabase provisioning, ownership, and deployed sign-in/save/reload still require verification. [SETUP.md](SETUP.md) provides the launch path; [VERIFICATION.md](VERIFICATION.md) records actual checks.
