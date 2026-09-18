# KIRA OS

**Let Kira write. The agents run the business.**

KIRA OS is a private author-business workspace for Kira Stanley. It brings her catalog, business briefs, decisions, and lessons together while preserving her creative voice. It does not generate novels, manuscripts, chapters, scenes, or fiction.

**Start with [SETUP.md](SETUP.md) to connect Vercel and Supabase.** Connected functionality is implemented; hosted setup and end-to-end verification are still required. Vercel project `storm-booked/kira-os` is deployed at [KIRA OS](https://kira-os-dusky.vercel.app), with access closed until setup is complete. The next setup step is accepting Supabase's integration terms in Vercel, after which the helper can provision the dedicated resource without a separate Supabase CLI login. No Supabase resource has been created yet. See [VERIFICATION.md](VERIFICATION.md) for checked results and remaining deployment work.

## Two explicit modes

| Mode | What happens |
| --- | --- |
| `demo` (default) | Explore without credentials. Synthetic intelligence is labeled DEMO. Decisions and feedback stay in this browser. |
| `connected` | Existing Supabase users sign in with email/password. Authorized owners, editors, and viewers access the configured author workspace. Briefs, decisions, and feedback persist in Supabase. Missing configuration or failed authorization closes private access. |

Connected mode never substitutes demo data after a connection failure. Its home shows sourced catalog counts and actual workspace records. The Raven has no live model yet; demo refresh is unavailable in connected mode.

## What works

- Responsive Mission Control, private welcome/sign-in, searchable starter catalog, and sourced book-detail sections.
- Cassandra’s Desk: create a manual business brief; edit, approve, or reject pending requests; save lessons; retain reviewed decisions; export the workspace.
- Authenticated shared storage with tenant isolation, version checks, immutable approval provenance, and database audit events.
- Demo-only Raven prioritization, recommendations, metrics, and tactic examples, separated from the private workspace.
- Server-side creative policy, honest connection status, and a browser reset available only in demo mode.
- Three SQL migrations, 25 tenant tables, pgvector foundation, a demo seed, and a separate production catalog bootstrap.
- Local setup/check commands, logic/SQL/auth/API tests, and browser/accessibility checks.

## Start locally

Node.js 22+ (tested with 24.16), npm, and Git are required. No database is needed for the demo.

```bash
git clone https://github.com/SimzyStormBooked/Kira_OS.git
cd Kira_OS
npm ci
npm run dev
```

Open `http://localhost:3000`. Use `npm run dev -- --port 3100` for another port. Fonts are bundled locally; decorative book covers are visibly labeled placeholders.

For an existing Supabase project prepared using [SETUP.md](SETUP.md):

```bash
npm run setup:local
npm run setup:check
npm run dev
```

The helper hides key entry and writes a git-ignored `.env.local` with private file permissions. It requires `--replace` to update an existing file. The check validates local settings; it does not verify remote migrations, credentials, or owner assignment.

## Environment

See `.env.example`. Demo is the default when `KIRA_WORKSPACE_MODE` is absent. Set `KIRA_WORKSPACE_MODE=connected` explicitly for the private production deployment so incomplete setup cannot open the demo.

| Variable | Purpose |
| --- | --- |
| `KIRA_WORKSPACE_MODE` | `demo` or `connected`; invalid values fail closed |
| `KIRA_AUTHOR_ID` | Author UUID; bootstrap default is `10000000-0000-4000-8000-000000000001` |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS origin of the dedicated Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key or legacy **anon** key |
| `NEXT_PUBLIC_APP_URL` | Localhost origin during development; final HTTPS origin on Vercel |
| `AI_PROVIDER`, `AI_RAVEN_MODEL`, `AI_SPECIALIST_MODEL` | Reserved configuration; shipped intelligence remains the demo engine |

The web app never uses a service-role or secret Supabase key. Creative permissions are enforced in code, not mutable client environment flags.

## Data truth

| Data | Origin and limitation |
| --- | --- |
| Author name, website, Instagram handle | Supplied manually in the brief |
| 5,447 followers and 880 posts | Manual snapshot; capture date unknown; never live metrics |
| Eight book titles and order | Checked against the official author site on 2026-09-17; currently bundled in the catalog UI |
| Descriptions, characters, relationships, tropes, themes, reviews, sales | Not imported; still need verification |
| Demo metrics, findings, recommendations, briefs, tactic example | Synthetic; no claims about real performance |
| Connected briefs, decisions, and lessons | Actual member input saved to the authorized author workspace |

Sources: [My Alpha Team](https://www.kirastanleyauthor.com/myalphateam), [Fantasy](https://www.kirastanleyauthor.com/fantasy), [Ambros Triplets](https://www.kirastanleyauthor.com/ambrostriplets). The catalog is incomplete; naming inconsistencies remain verification notes. “Universe” organizes the catalog without asserting shared fictional continuity.

## Routes

| Route | Behavior |
| --- | --- |
| `/login` | Email/password sign-in for existing accounts; no public signup |
| `/` | Demo Mission Control or private workspace home |
| `/universe`, `/universe/[slug]` | Searchable sourced catalog and book details |
| `/desk` | Manual briefs in connected mode; approval queue, history, edits, and lessons |
| `/raven` | Demo briefing; honest unconnected intelligence state in private mode |
| `/settings` | Policy, connection state, export; demo-only reset |
| `/reader-pulse`, `/social`, `/discoverability`, `/hunt`, `/campaigns`, `/outreach`, `/vault` | Clearly labeled future-module previews |
| `GET/PATCH /api/workspace` | Authenticated, author-scoped reads and validated mutations |
| `POST /api/raven` | Demo-only deterministic run; unavailable in connected mode |
| `POST /auth/login`, `POST /auth/logout` | Existing-account sign-in and sign-out |

## Database setup

Use a dedicated Supabase project. Apply migrations with `npx supabase db push` after linking the correct project, run `supabase/bootstrap.sql`, and assign an existing email-confirmed Auth user as author owner. Disable public signups. [SETUP.md](SETUP.md) has the sequence.

`supabase/bootstrap.sql` contains the sourced catalog and explicitly manual snapshot. It includes no demo intelligence or auth users and preserves existing records/owner assignments when reapplied. Regenerate it with `npm run db:bootstrap:generate`.

For disposable local development only, `npx supabase start` and `npx supabase db reset` apply migrations and `supabase/seed.sql`. **Local reset destroys that local database.** The demo seed includes synthetic intelligence and should not enter Cassie’s real workspace. Regenerate it with `npm run db:seed:generate`.

## Development and verification

```bash
npm run check             # Typecheck, lint, unit/database tests, production build
npx playwright install chromium
npm run test:e2e          # Desktop/mobile workflows and accessibility
```

SQL tests run the real migrations in PGlite with pgvector and emulated Supabase auth primitives. Auth/API tests exercise application boundaries. These do not replace a hosted Supabase/Vercel sign-in/save/reload test. Playwright uses port 3100; exact results belong in [VERIFICATION.md](VERIFICATION.md).

`scripts/ci.yml.example` is an inactive CI template. Installing `.github/workflows/ci.yml` still requires GitHub workflow permission.

## Deployment and next work

Use the existing Vercel project with the Next.js preset, `npm ci`, and `npm run build` from the repository root. Configure connected mode and required values before inviting users. Redeploy after environment changes. Use a separate database for previews. The app is excluded from search indexing.

Next is approved Vault ingestion: private Storage for official covers and documents, rights/provenance, field verification, then read-only retrieval with citations. Live models and integrations follow approved sources. Publishing, outreach sending, spending, autonomous scheduling, learned feedback retrieval, and embedding generation remain unimplemented.

See [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ROADMAP.md](ROADMAP.md), and [AGENTS.md](AGENTS.md).
