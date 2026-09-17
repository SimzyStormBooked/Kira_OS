# KIRA OS

**Let Kira write. The agents run the business.**

KIRA OS is an author-business intelligence workspace for independent romance author Kira Stanley. Phase One is a working, intentionally bounded demo: a premium command center with evidence-backed recommendations and human decisions. It does not write novels, chapters, scenes, or fiction.

## Phase One

- Responsive Mission Control, six clearly labeled demo metrics, Raven briefing, recommendations, and honest agent status.
- The Universe: eight sourced book titles across three series/collections; searchable/filterable catalog and fourteen knowledge sections per book.
- The Raven: actual deterministic prioritization, provenance validation, a server-only provider boundary, and a working refresh API. No live model or autonomous specialists.
- Cassandra’s Desk: prepare a brief, edit it, approve/reject, teach Raven, retain reviewed decisions, and export the workspace. Local browser persistence survives reloads.
- Settings: creative firewall, honest connection status, export, and explicit local reset.
- Two Supabase/Postgres migrations, 24 tenant-scoped tables, pgvector, generated seed, RLS, provenance constraints, and approval transition enforcement.
- Unit/database tests, desktop/mobile browser tests, accessibility checks, and a GitHub Actions CI template.

## Start locally

Node.js 22+ (tested with 24.16), npm, and Git are required. No credentials or database are necessary for the demo.

```bash
git clone https://github.com/SimzyStormBooked/Kira_OS.git
cd Kira_OS
npm ci
npm run dev
```

Open http://localhost:3000. For another port: `npm run dev -- --port 3100`.

Fonts are bundled locally. Runtime page rendering does not depend on a font CDN. Catalog cover art is typographic placeholder artwork, visibly labeled as such.

## Data truth

| Data                                                                                      | Origin / limitation                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Kira Stanley, website, Instagram handle                                                   | Supplied manually in the brief                                         |
| 5,447 followers and 880 posts                                                             | Manual snapshot; capture date unknown; never described as live         |
| Eight book titles and ordering                                                            | Checked against the official author site on 2026-09-17                 |
| Book descriptions, characters, relationships, tropes, themes, reviews, sales              | Not imported; NEEDS VERIFICATION                                       |
| All dashboard metrics, trend samples, findings, recommendations, briefs and tactic sample | Explicit DEMO; no real ROI, sales, demographics, or performance claims |
| Your typed feedback                                                                       | Actual manual feedback, scoped to the local demo workspace             |

Sources: [My Alpha Team](https://www.kirastanleyauthor.com/myalphateam), [Fantasy](https://www.kirastanleyauthor.com/fantasy), [Ambros Triplets](https://www.kirastanleyauthor.com/ambrostriplets). The catalog is deliberately incomplete. The official site has inconsistent series-name variants for Onisea and Ambros; the detail screens preserve verification notes. No fictional universe relationship is implied by the organizational collection.

## Routes

| Route                                                                                        | Behavior                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/`                                                                                          | Mission Control                                                                      |
| `/raven`                                                                                     | Briefing, refresh, restore set-aside moves, tactic memory and agents                 |
| `/universe`                                                                                  | Searchable, filterable catalog                                                       |
| `/universe/[slug]`                                                                           | Eight book detail pages, sources and verification states                             |
| `/desk`                                                                                      | Approval queue, reviewed history, editing and teaching                               |
| `/settings`                                                                                  | Policy, connections, export and reset                                                |
| `/reader-pulse`, `/social`, `/discoverability`, `/hunt`, `/campaigns`, `/outreach`, `/vault` | Explicitly labeled future-module previews; no pretend integrations                   |
| `POST /api/raven`                                                                            | Produces a demo run and three provenance-backed recommendations from seeded findings |

Use the search button or Command/Ctrl+K to jump to a title or workspace.

## Environment variables

See `.env.example`. **None are needed for the demo.**

- `NEXT_PUBLIC_APP_URL`: reserved application URL, defaults illustrated as localhost.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: used only by the server-side client factory when a future authenticated adapter calls it. Merely setting them does not change the application to live mode.
- `AI_PROVIDER`, `AI_RAVEN_MODEL`, `AI_SPECIALIST_MODEL`: documented reserved configuration for future adapters; the shipped provider is explicitly fixed to the demo engine.

Never expose AI keys or privileged Supabase keys with a `NEXT_PUBLIC_` prefix. No service-role key is used or required. Creative permissions are enforced by application policy, not mutable environment flags.

## Supabase setup and migrations

The app currently uses a versioned localStorage repository for the demo. SQL establishes the durable data model for the next authenticated slice.

For a local Supabase stack, install/start a Docker-compatible runtime and use the Supabase CLI:

```bash
npx supabase start
npx supabase db reset
```

`db reset` destroys the **local** database and applies `supabase/migrations` plus `supabase/seed.sql`. Use it only for local development. The seed is generated from the same records used by the app:

```bash
npm run db:seed:generate
```

For a fresh remote project you own:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

`db push` applies migrations; it does not automatically load the demo seed. Review before applying the seed to a remote database. There is no reason to import demo intelligence into a production author workspace. No remote database was created or changed during this build.

The seed intentionally creates no auth users and leaves the seed author's `owner_user_id` null, so it is inaccessible through the authenticated API until an administrator assigns an existing auth user. In a local test database, after creating an auth user, use the SQL editor:

```sql
update public.authors
set owner_user_id = 'YOUR_EXISTING_AUTH_USER_UUID'
where id = '10000000-0000-4000-8000-000000000001';
```

A server-only Supabase client factory and repository contract are present. Login, session refresh, and the live persistence adapter are **not implemented**. Add them before ingesting private author data; the Phase One demo itself has no login wall.

## Development and verification

```bash
npm run typecheck         # Next route types + TypeScript
npm run lint              # ESLint, no warnings
npm test                  # Logic + real SQL in embedded Postgres/pgvector
npm run build             # Next production build
npm run check             # All four above
npx playwright install chromium
npm run test:e2e          # Desktop + mobile, end-to-end flows + axe checks
```

Database tests execute both unmodified migration files and the seed in PGlite with the actual pgvector extension. They emulate only Supabase's `auth.users`, roles, and `auth.uid()` primitives. They test RLS with non-superuser roles, cross-author references, provenance, approval transitions, and feedback attribution. A real hosted Supabase environment still needs integration verification when live auth/persistence is implemented.

Playwright starts a local dev server on port 3100, or reuses that port outside CI. See `VERIFICATION.md` for the completed build's exact results and limitations.

The inactive CI template is `scripts/ci.yml.example`. GitHub refused creation of `.github/workflows/ci.yml` because the current OAuth connection lacks `workflow` scope. Once a repository administrator has suitable access, copy the template to `.github/workflows/ci.yml` and commit it. All listed checks have already passed locally.

## Deployment

The repository is Vercel-compatible: select the Next.js framework preset, use `npm ci` and `npm run build`, and deploy from the repository root. No provider or database environment variables are required for a demo preview. The UI intentionally identifies demo mode and stores decisions independently per browser/origin. A Vercel preview URL will not share localhost's saved decisions.

A deployment was not requested or performed. Before deploying private or connected data, implement authenticated access, session renewal, the Supabase repository, and integration tests. The app is excluded from search indexing through Next metadata.

## Known boundaries

- Demo data and browser-local decisions only; no shared/cloud state, authentication, live social metrics, ingest pipeline, or publishing.
- Teach Raven stores and exports feedback; it does not change current deterministic ranking or train a model.
- Browser storage is not a backup or multi-user transaction system. Export before clearing it. A storage failure is shown as an error.
- AgentRun is returned by the refresh API; the local workspace retains the latest run timestamp, not a complete execution log. The SQL run model is ready for durable logging.
- Evidence and confidence are visible review aids, not promises of outcomes. Unknown catalog facts remain unknown.
- The vector column is a nullable 1536-dimensional foundation. Select and version an embedding model before ingesting; no embeddings are generated now.

## What to build next

Build **Phase Two: authenticated Vault ingestion**, in this order: Supabase Auth + author membership; a tested Supabase repository for decisions/feedback; approved source-document and official-cover upload to private Storage; source hashes and read-only parsing; Cassandra's field-by-field verification; only then chunking/embeddings and retrieval that cites the approved sources. This makes five years of real author material usable without changing the Phase One contracts.

See `ARCHITECTURE.md`, `DATABASE.md`, `AGENTS.md`, and `ROADMAP.md` for implementation details and boundaries.
