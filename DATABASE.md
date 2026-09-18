# KIRA OS database

Three migrations define 25 UUID-keyed, tenant-scoped tables. Every application table enables RLS. Tenant foreign keys include `author_id` to prevent cross-author references. Supabase supplies `auth.users` and `auth.uid()`. The connected app uses the signed-in user’s client, never a service-role key.

## Schema

| Group | Tables | Purpose |
| --- | --- | --- |
| Workspace | `authors`, `author_members` | Owner/editor/viewer access |
| Provenance | `sources` | Identity, URL, timestamps, origin, metadata |
| Catalog | `universes`, `series`, `books` | Collections and sourced title/order fields |
| Knowledge | `characters`, `relationships`, `tropes`, `themes`, `book_tropes`, `book_themes` | Source-backed foundation; no invented fictional details |
| Assets/commerce | `products`, `content_assets` | References, rights, read-only assets |
| Context | `social_accounts`, `campaigns` | Manual snapshots and campaign foundation |
| Agents | `agent_definitions`, `agent_runs`, `agent_findings`, `agent_recommendations` | Execution and evidence-backed intelligence |
| Human control | `approval_requests`, `human_feedback`, `approval_events` | Versioned decisions, attributed lessons, audit events |
| Learning | `tactic_memory` | Observations, context, trend, evidence |
| Retrieval | `knowledge_chunks` | Sourced text, hash, optional 1536-dimensional vector, model version |
| On-demand AI | `workspace_generations` | Private questions, structured answers, status, actor, model, token/cost metadata |
| Access audit | `workspace_access_events` | Owner-attributed grant/change/revoke events |
| Connections | `workspace_links`, `meta_authorizations` | Manual shortcuts and separately verified account-authorization metadata |

The foundation, knowledge-vector, and connected-workspace migrations establish catalog, pgvector, and audited review operations. Later migrations add generations, access management, manual links, and Meta authorization. Apply them in filename order. Embeddings remain nullable; no ingestion, similarity endpoint, or ANN index is implemented.

`20260918005218_studio_request_validation.sql` is a forward-only correction to Studio's private begin function. It validates request fields before looking up a reused UUID and uses null-safe identity comparisons. Its signature and grants remain unchanged; already-applied migrations are not rewritten.

## Provenance

Catalog rows identify sourced fields and retain partial verification status. Descriptions and fictional knowledge stay null/empty. Unknown capture dates remain unknown even if recording time is known.

Finding/recommendation/approval/tactic evidence is a nonempty JSONB array with source UUID, type/name, retrieval timestamp, excerpt/metric, metadata, and origin. Triggers reject absent provenance, missing/cross-author sources, origin mismatches, and non-demo conclusions built from demo evidence. Findings must declare every evidence source.

Manual briefs create a source attributed to `auth.uid()` and embed the original text as evidence. Later draft edits preserve that snapshot. Authenticated callers cannot update or delete source identities. Large future payloads belong in private Storage with hashes and approval/rights records.

## Authorization and audit

- Owners can read/edit and manage members. Editors can read/write domain data. Viewers can read only.
- Anonymous callers have no application-table grants or policies.
- RLS membership helpers are stable SECURITY DEFINER functions in a private schema with an empty search path.
- Feedback is append-only and binds `user_id` to `auth.uid()`.
- Sources, agent history, and approvals have no authenticated delete policies.
- Approvals start pending at version zero. Updates increment version once. Closed decisions, identity, evidence, and review context are immutable.
- `approval_events` grants authenticated SELECT only, scoped by RLS. A private trigger records actor, action, prior/new version, and timestamp; clients cannot forge or mutate events.

Audit events retain creation, edit, approval, and rejection metadata in SQL. A dedicated audit viewer/export is not implemented. Administrative bootstrap has no authenticated actor and does not invent one.

## Connected RPCs

Mutation RPCs are SECURITY INVOKER, use an empty search path, require an authenticated owner/editor, and preserve RLS:

| Function | Behavior |
| --- | --- |
| `create_manual_review` | Atomically creates a manual source, original-text evidence, and pending brief; title 1–200 characters, draft 1–10,000 |
| `decide_approval` | Locks a non-demo request, checks expected version, edits/approves/rejects; edits stay pending for separate review |
| `teach_raven` | Adds an attributed 1–4,000 character lesson with `scope=author_workspace` |
| `queue_recommendation` | Locks a stored non-demo recommendation and creates at most one linked review with its stored provenance |
| `dismiss_recommendation` | Persists non-demo recommendation dismissal |
| `restore_recommendations` | Restores dismissed non-demo recommendations, preserving queued relationships |

`lib/db/connected-repository.ts` uses explicit tenant filters and the session’s author ID. It excludes synthetic business records and reloads after mutation. The API validates commands independently and reports conflicts/access errors instead of silently saving stale data.

## AI records and access management

`workspace_generations` has RLS-protected member reads and no authenticated direct writes. `workspace_generation_begin` serializes on the author row, permits one active request, and enforces 20 attempts per UTC day. An identical UUID returns its existing record without authorizing another model call; changed inputs or another actor cannot reuse it. Interrupted requests are closed on a later begin operation. `workspace_generation_finish` permits only the requesting writer and preserves final records.

Both functions are public SECURITY INVOKER wrappers over private SECURITY DEFINER implementations with empty search paths. They also require a server-only `KIRA_AI_RECORDING_KEY`; otherwise an authorized member could fabricate model provenance through PostgREST. `private.workspace_generation_config` contains only the SHA-256 hash and has no member grants or policies. The key is 32 random bytes encoded as 64 hexadecimal characters and must never be exposed to clients.

Structured output shape, size, null handling, and exact supplied-context excerpts are checked in application code and SQL. Saved metadata includes model, actor, timestamps, known token counts, list-price cost estimate, Gateway generation ID when available, and an allowlisted failure code. Unknown usage remains null. Raw provider errors, headers, and credentials are never recorded. These rows are not verified research and do not enter the manual-brief evidence pipeline automatically.

The API gives the 45-second model call a 90-second route budget, leaving time for authorization, credit checks, and persistence. Both successful and failed outcomes receive at most one idempotent database-write retry. The model is never automatically rerun; unresolved persistence failures retain the request ID for recovery.

Access RPCs similarly expose invoker wrappers around private owner-checking implementations. Grants require an existing, confirmed, active Auth user. Role changes/revocation use membership UUIDs and expected versions; direct membership writes are revoked. Immutable access events retain the actor and affected account. No RPC creates an Auth account or sends email.

## Connection boundaries

`workspace_links` stores canonical, allowlisted profile/notebook URLs as manual shortcuts. RLS controls access; a link is not proof of account ownership or an OAuth connection.

Meta public metadata is separated from `private.meta_credentials`, `private.meta_oauth_states`, and `private.meta_connector_config`. Credentials are encrypted in the server adapter; private functions require the server capability and appropriate owner/session checks. The connector has no service-role runtime key. App credentials and successful provider consent are still required before describing Meta as connected. Authorization does not imply metrics ingestion or publishing.

## Bootstrap versus demo seed

`supabase/bootstrap.sql`, generated by `npm run db:bootstrap:generate`, contains the author, official sources, organizational universe, three collections, eight sourced titles, and the explicitly manual Instagram snapshot. It contains no demo intelligence, auth users, or credentials. Reapplication uses conflict-do-nothing and preserves assigned ownership.

For a new installation, an administrator creates an **email-confirmed existing Auth user** with a password, disables public signup, and assigns its UUID to `authors.owner_user_id`. Further existing users can be added through the owner’s Access screen. The web app cannot self-claim an author. The deployed project already has Michael’s confirmed owner and eight sourced books, with no demo intelligence. See [SETUP.md](SETUP.md).

`supabase/seed.sql`, generated by `npm run db:seed:generate`, is for disposable local demo databases. It additionally includes synthetic findings, recommendations, review examples, and tactics. Do not load it into Cassie’s real workspace. Both files initially leave the owner null; neither creates users.

## Verification and future data

Tests execute migrations in PGlite with actual pgvector and emulated Supabase auth primitives. They cover tenant access, direct-table constraints, provenance, stale versions, atomic briefs, lessons, queues, audit history, AI request limits/idempotency, and server-capability enforcement. Bootstrap tests assert that demo intelligence stays out. The core workflow has also passed real hosted Supabase/Auth save and cross-browser checks; the latest migration/API slice still needs its final integrated hosted verification.

Private uploads, reader reviews, observed social metrics, campaign outcomes, search data, outreach history, and opportunities remain future work. Their ingestion rules should follow real inputs, permission, author scoping, and measured timestamps. Do not invent fictional metadata or business performance to populate them.
