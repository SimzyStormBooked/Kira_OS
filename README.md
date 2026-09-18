# KIRA OS

**Let Kira write. A little help for the business.**

KIRA OS is a private author-business workspace for Kira Stanley. It brings her catalog, business briefs, decisions, and lessons together while preserving her creative voice. It does not generate novels, manuscripts, chapters, scenes, or fiction.

**The private workspace is online at [KIRA OS](https://kira-os-dusky.vercel.app).** Vercel project `storm-booked/kira-os` uses dedicated Supabase project `obusnqlwuoavwtmryiik`. Real hosted checks cover sign-in, brief save/reload, a separate-browser read, sign-out, and an actual Ask Raven answer saved through the deployed app. The database contains eight sourced books and no demo intelligence. [SETUP.md](SETUP.md) covers Cassie’s account and optional connections; [VERIFICATION.md](VERIFICATION.md) records the release checks and remaining Meta setup.

## Two explicit modes

| Mode | What happens |
| --- | --- |
| `demo` (default) | Explore without credentials. Synthetic intelligence is labeled DEMO. Decisions and feedback stay in this browser. |
| `connected` | Existing Supabase users sign in with email/password or an operator-issued, single-use private link. Authorized owners, editors, and viewers access the configured author workspace. Briefs, decisions, and feedback persist in Supabase. Missing configuration or failed authorization closes private access. |

Connected mode never substitutes demo data after a connection failure. Its home shows sourced catalog counts and actual workspace records. Ask Raven is enabled in production using `google/gemini-3.8-flash`; a real in-app answer, reload, attributed Desk copy, and private access after sign-out have passed. The recommendations page does not monitor accounts or run research in the background. Demo Raven refresh is unavailable in connected mode.

## What works

- Responsive Mission Control, private welcome/sign-in, searchable starter catalog, and book details that lead with verified information. A book-details starter collects approved copy and source links in an editable Desk brief; it does not update the catalog or upload files.
- Workspace search finds books, saved brief titles, and pages. Brief results open the correct pending/reviewed tab and focus the selected record.
- Optional Guide, shared-workspace first steps, and expandable page help. Starter records do not count as Cassy personally completing onboarding. Future modules are grouped under “Coming later.”
- A curated idea shelf with manual category/previous/next controls, plus attributed public-domain literary quotes linked to their original texts.
- Cassandra’s Desk: create a manual business brief; edit pending requests; confirm final approval/rejection; save lessons; retain reviewed decisions; export review data. Confirmation explains that a final decision locks the brief and does not execute an external action.
- Authenticated shared storage with tenant isolation, version checks, immutable approval provenance, and database audit events.
- Learn & Create: short lessons, four business-agent recipes, editable local blueprints, copying/downloading, and explicit saving to the desk. A blueprint is a plan, not a running agent.
- Ask Raven: live business brainstorming, agent design, and learning with saved questions/results at private addressable URLs. Completed answers can be explicitly copied into attributed Desk briefs. Real production generation, persistence, reload, and Desk-copy checks have passed.
- Owner-managed access for existing confirmed accounts, viewer-aware controls, and password changes that require the current password or a server-verified private-link sign-in within the previous 15 minutes.
- Saved social/notebook shortcuts and an explicit copy bridge to NotebookLM. Meta authorization code is implemented but awaits app credentials and provider verification; a shortcut does not sync an account.
- Demo-only Raven prioritization, recommendations, metrics, and tactic examples, separated from the private workspace.
- Server-side creative policy, a Settings connection checklist with current status and role-appropriate next steps, and a browser reset available only in demo mode. Status refreshes do not connect accounts or purchase credits.
- SQL migrations with RLS, pgvector foundation, a demo seed, and a separate production catalog bootstrap.
- Local setup/check commands, logic/SQL/auth/API tests, and browser/accessibility checks.

“Use this idea” opens an editable business brief from a known curated prompt. Nothing is saved until “Save for review.” An unfinished brief stays in memory while navigating inside the workspace, but is lost on reload or sign-out; it is excluded from saved workspace data and exports. Selecting another idea offers a choice before replacing existing words. The reflections and quotations are editorial material, not live AI findings or generated fiction.

Learn & Create recipe notes/previews and unsent Ask Raven questions now survive internal workspace navigation in the current tab. These scratchpads are account-scoped memory, not browser storage or saved account data. Save, download, or copy before reloading or closing the tab. Sign-out asks before discarding unfinished work and clears it only after confirmed sign-out; detected session loss clears private scratchpads.

The workspace JSON export contains briefs, decisions, lessons, and recommendation state; it does not include unfinished text, Ask Raven history, account access, or connector credentials. Saved Raven answers can be copied individually or explicitly saved as attributed review briefs. Starting a new question resets its request identity deliberately; ordinary navigation retains the current question's retry identity.

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
| `KIRA_AI_ENABLED` | `true` in verified production; defaults to `false` for a new environment until funded provider and recording setup are ready |
| `KIRA_AI_RECORDING_KEY` | Server-only 32-byte key encoded as 64 hex characters; its SHA-256 hash is provisioned in a private database table |

The web app never uses a service-role or secret Supabase key. Privileged integration-injected Supabase credentials have been removed from Vercel’s runtime environment. Gateway uses Vercel authentication; optional Meta credentials stay server-only. Creative permissions are enforced in code, not mutable client environment flags.

## Data truth

| Data | Origin and limitation |
| --- | --- |
| Author name, website, Instagram handle | Supplied manually in the brief |
| 5,447 followers and 880 posts | Manual snapshot; capture date unknown; never live metrics |
| Eight book titles and order | Checked against the official author site on 2026-09-17; currently bundled in the catalog UI |
| Descriptions, characters, relationships, tropes, themes, reviews, sales | Not imported; still need verification |
| Demo metrics, findings, recommendations, briefs, tactic example | Synthetic; no claims about real performance |
| Connected briefs, decisions, and lessons | Actual member input saved to the authorized author workspace |
| Inspiration questions and brief starters | Curated editorial reflections, labeled as such; no claims about reader behavior or book performance |
| Literary quotations | Source-linked public-domain excerpts with author, work, and context |
| Agent blueprints | Locally assembled planning documents; member input when explicitly saved |
| Ask Raven answers | AI-generated ideas using only supplied context; not verified research or executed work |
| Saved connections | Manually supplied shortcuts; separate from a verified OAuth authorization |

Sources: [My Alpha Team](https://www.kirastanleyauthor.com/myalphateam), [Fantasy](https://www.kirastanleyauthor.com/fantasy), [Ambros Triplets](https://www.kirastanleyauthor.com/ambrostriplets). The catalog is incomplete; naming inconsistencies remain verification notes. “Universe” organizes the catalog without asserting shared fictional continuity.

## Routes

| Route | Behavior |
| --- | --- |
| `/login` | Email/password sign-in for existing accounts; no public signup |
| `/welcome` | Private one-time link landing page; an explicit button submits the token, so opening a preview does not consume it |
| `/` | Demo Mission Control or private workspace home |
| `/universe`, `/universe/[slug]` | Searchable sourced catalog, collapsed unverified sections, and explicit preparation of a sourced review brief |
| `/desk` | Editable business briefs, confirmed final decisions, history and lessons; known `?idea=` values open curated starters and `?brief=` selects a saved record |
| `/raven` | Demo briefing; honest unconnected intelligence state in private mode |
| `/learn` | Lessons and local agent-blueprint workshop |
| `/studio`, `/studio/[id]` | Ask Raven, private question history, and saved results; funding gate applies to new calls |
| `/connections` | Manual shortcuts, NotebookLM copy bridge, and gated Meta authorization |
| `/access` | Role information; owner-only grant/change/revoke for existing confirmed accounts |
| `/settings` | Policy, live connection-status checklist, password change, brief/lesson export; demo-only reset |
| `/reader-pulse`, `/social`, `/discoverability`, `/hunt`, `/campaigns`, `/outreach`, `/vault` | Clearly labeled future-module previews |
| `GET/PATCH /api/workspace` | Authenticated, author-scoped reads and validated mutations |
| `POST /api/raven` | Demo-only deterministic run; unavailable in connected mode |
| `GET/POST /api/studio` | Authenticated history and bounded, persisted AI requests |
| `GET/PATCH /api/access` | Role-aware reads and owner-only membership management |
| `POST /api/account/password` | Current-password verification followed by same-account password update |
| `POST /api/account/password/setup` | Same-account password choice after a server-verified private-link sign-in within 15 minutes |
| `POST /auth/login`, `POST /auth/logout` | Existing-account sign-in and sign-out |
| `POST /auth/welcome` | Supabase magic-link verification followed by existing workspace membership verification; same-origin only |

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

The UX release and live Ask Raven are deployed and the real generation/persistence workflow is verified. Meta still needs app setup and consent. Approved Vault ingestion remains future work: private Storage, rights/provenance, field verification, then read-only retrieval with citations. Publishing, outreach sending, autonomous scheduling, learned feedback retrieval, and embedding generation remain unimplemented. On-demand AI calls consume credits only after explicit submission and successful setup.

See [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ROADMAP.md](ROADMAP.md), and [AGENTS.md](AGENTS.md).
