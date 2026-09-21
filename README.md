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

- Responsive Mission Control, private welcome/sign-in, a private editable book library, and book details that lead with attributed information. A book-details starter collects approved copy and source links in an editable Desk brief; it does not update the catalog or upload files.
- The Universe supports adding/editing real books and series, audiobook metadata, and permission-confirmed DOCX/PDF/EPUB/TXT/Markdown uploads. Saving a manuscript and having Raven read it are two separate steps: the file is parsed and stored privately first, and reading starts only when she chooses **Start reading with Raven**. Reading is resumable, with spoiler controls and manuscript version history.
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

“Use this idea” opens an editable business brief from a known curated prompt. Nothing is saved until “Save for review.” An unfinished brief stays available while navigating inside the workspace and survives a reload of that tab; it is excluded from saved workspace data and exports, and it is discarded on sign-out. Selecting another idea offers a choice before replacing existing words. The reflections and quotations are editorial material, not live AI findings or generated fiction.

Learn & Create recipe notes/previews, unsaved rewrites of a brief, and unsent Ask Raven questions survive internal workspace navigation and a reload of the same tab. They are kept per tab in `sessionStorage`, scoped to the mode and signed-in account and validated on restore; they are never written to the demo `localStorage` key, never sent to the server, and never included in saved account data or exports. Closing the tab still ends them, so save, download, or copy anything you want to keep. Sign-out asks before discarding unfinished work and clears it only after confirmed sign-out. A detected session loss no longer discards anything: it stops, shows every unfinished draft in a dialog with a copy control, and clears them only when she chooses to sign in again. Other long-text fields — an unsaved Teach Raven lesson, the marketing-plan form, plan notes, book metadata — join the same guard by registering with the workspace store: the reload warning, the sign-out confirmation and the session-ended dialog all see them, but their text is held only in the open page and is not written to `sessionStorage`. If the browser refuses to hold a stored draft, the desk stops claiming the draft is kept and shows a warning to copy it before reloading. If a stored draft cannot be read back, the raw text is shown in a dialog with copy and download before anything replaces it.

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
| Eight book titles and order | Checked against the official author site on 2026-09-17; stored in Supabase; demo mode retains its separate bundled catalog |
| Manuscript findings and characters | Extracted only from permission-approved uploads; exact citations retained; unreviewed, with inferences and spoilers labeled |
| Reviews, sales and reader performance | Not integrated; never inferred as measured outcomes |
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
| `/universe`, `/universe/[slug]` | Private editable library, versioned manuscript upload, extracted knowledge, citations and source-text search; separate demo catalog |
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

The UX release and live Ask Raven are deployed and the real generation/persistence workflow is verified. Meta still needs app setup and consent. The manuscript foundation adds private versioned uploads, bounded extraction, persistent character observations, exact citations, optional embeddings and free source-text search. See [the manuscript runbook](docs/manuscript-foundation.md). Strategy briefs, flexible goals, admin strategy review, release plans, cross-book recommendations and automatic manuscript retrieval in Ask Raven are the next increments. Publishing, outreach sending, autonomous scheduling and learned feedback retrieval remain unimplemented. On-demand AI calls consume credits only after explicit submission and successful setup.

See [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ROADMAP.md](ROADMAP.md), and [AGENTS.md](AGENTS.md).


### Marketing Plans and manuscript-aware Raven

Cassandra’s Desk keeps original ideas, requests and decision history. **Turn this idea into a marketing plan** creates a separate persistent strategy linked to that original request. The Marketing Plans area offers launch, back-catalog, audiobook, reader-acquisition, series and re-engagement starting points; selected books/series; separate reader segments; optional budget and weekly time; and up to eight user-defined numeric goals.

Raven snapshots the current input and approved-source evidence before a paid call. Validated revisions retain exact citations, model, usage estimate, actor and timestamps. Owners review the latest revision, request changes with feedback, approve, then activate. Activation creates one internal campaign and actual dated tasks. Pre-release phases count backwards from launch; post-release/evergreen phases count forwards. Editors can update task progress and add attributable manual result snapshots. A follow-up cycle can use those observations and updated baselines; it does not claim that correlation proves campaign impact. Auto-approval is disabled. There is no publisher, spend executor, campaign scheduler or automatic analytics collection.

Ask Raven can use up to four selected books. The database selects bounded, relevant structured observations, character records and metadata; explicit spoiler opt-in adds matching raw excerpts. Retrieval currently ranks text relevance rather than issuing a fresh embedding request. Exact quoted context maps to saved private references. Automated spoiler labels and extracted observations still need human review. Shared character names do not establish cross-book identity. New manuscript versions affect new requests; historical snapshots remain unchanged, and revoked source permission hides derived saved answers/revisions/tasks.

Catalog Opportunities compares supported, non-spoiler observations from approved active manuscripts. It shows both sides of a textual match and offers a new plan. These are campaign hypotheses, not measured reader demand or a complete semantic analysis. The bounded scan covers up to 100 books and 32 observations per book. With no manuscripts, it honestly shows no evidence-based matches and offers metadata-based plans instead.

Apply `202609190002_strategy_plans.sql` and `202609190003_studio_book_context.sql` after the manuscript migration. No new runtime credentials are required; these use the existing caller-bound Supabase session and private AI recording capability. Google Drive import and live Meta metrics remain separate external integration work.
