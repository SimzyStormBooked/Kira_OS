# KIRA OS — UX judging board shared brief

Repository: the repository (Next.js 16 app router, React 19, Tailwind v4 tokens + a large hand-written `app/globals.css`, Radix via `radix-ui`, lucide icons, Supabase in connected mode).
Branch: `claude/kira-ux-women-users`. Baseline `npm run check` is green (typecheck, lint, 515 unit/db tests, production build).

## Who the people are (from the owner, verbatim intent)
- **Michael** — the owner/administrator and the builder of this app. In the UI he appears as the "owner" role and by first name in a few places.
- **Cassy** (Cassandra) — Michael's best friend since childhood. She is the person who will actually use this app, and she is being shown it **tomorrow**. She has an Editor account today; Michael is Owner.
- **Kira Stanley** — Cassy's **pen name**. So "Kira" (the writer) and "Cassandra" (the business desk) are the *same woman*. "Let Kira write. A little help for the business." means: her creative self keeps writing; this workspace carries the business side. Copy that treats Kira and Cassandra as two different people is a mistake; copy that treats them as two facets of one woman is the intended concept.
- Real catalog: 8 sourced books by Kira Stanley (fantasy, romantic suspense). Author site: kirastanleyauthor.com.

## The ask
Optimize the experience for women users, with Bumble as the reference point: Bumble took women's feedback seriously and built the product around women's actual experience, agency and comfort rather than retrofitting a generic product. Dimensions that matter here (solo creative professional's business workspace):
- who holds control and consent at each step (defaults, gating, who moves first)
- how destructive or irreversible actions are framed and protected
- whether the tone is condescending or peer-level; whether the app treats her as the expert she is
- how much the app explains itself vs assumes; honesty about what is live / demo / manual snapshot
- how safe it feels to experiment and undo; draft protection; data-loss risk
- whether "your work" reads as genuinely hers
- how the app handles her creative material (manuscripts are intimate; permission and spoiler controls exist — judge whether they *feel* respectful and whether she can see what happens to her file and take it back)
- warmth and craft of the visual language; delight
Do NOT reduce this to pink styling or softening copy into vagueness. Substantive: agency, clarity, dignity, trust, delight.

## Hard product rules that must not be violated (from AGENTS.md / README.md)
- The app does NOT generate fiction, manuscripts, chapters or scenes. Creative policy is server-enforced (`lib/ai/policy.ts`).
- Demo vs connected mode separation is strict. Connected mode never falls back to demo data. Every synthetic record has `data_origin: "demo"` and visible DEMO treatment. Manual snapshots are not live APIs; unknown metadata stays null and visibly "needs verification".
- Approve records a decision only. No publisher, outreach sender, spend executor, catalog mutator. No hidden external execution.
- Teach Raven feedback stays attached to its approval, timestamped, attributable, exportable; never claim it trained a model.
- Ask Raven (Studio) is live only in connected mode with funding gates; never substitute demo output or claim a blueprint is running.
- Accounts are existing confirmed Supabase users; no signup, no invitations, no auth emails.
- Docs must stay aligned with code.
- Run `npm run check` and relevant `npm run test:e2e` after behavioral changes.

## Surface → file map
| Surface | Route | Files |
| --- | --- | --- |
| App shell: sidebar nav, topbar, search (⌘K), toasts, sign-out dialog, footer | all | `components/kira/app-shell.tsx`, `components/kira/workspace-guide.tsx`, `components/kira/inspiration-shelf.tsx`, `components/kira/daily-quote.tsx`, `components/kira/workspace-permission-notice.tsx`, `app/layout.tsx`, `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` |
| Mission Control (home) | `/` | `app/page.tsx`, `components/kira/mission-control.tsx` (demo), `components/kira/connected-home.tsx` (connected), `components/kira/getting-started.tsx`, `components/kira/metric-card.tsx`, `components/kira/raven-briefing.tsx`, `components/kira/recommendation-card.tsx`, `components/kira/agent-status.tsx`, `components/kira/origin-badge.tsx`, `components/kira/raven-art.tsx` |
| Briefings / The Raven (demo recommendations) | `/raven` | `app/raven/page.tsx`, `components/kira/raven-page.tsx`, `components/kira/evidence-drawer.tsx` |
| The Universe (catalog) | `/universe`, `/universe/[slug]` | `app/universe/page.tsx`, `app/universe/[slug]/page.tsx`, `components/kira/universe-catalog.tsx`, `components/kira/connected-library.tsx`, `components/kira/book-card.tsx`, `components/kira/book-detail.tsx` (demo), `components/kira/connected-book-detail.tsx` (connected: metadata, manuscript upload with permission checkbox, background reading, knowledge, spoiler-gated search, source passages, version history), `components/kira/book-knowledge.tsx`, `components/kira/book-details-brief.tsx`, `components/kira/library-provider.tsx`, `components/kira/library.css`, API in `app/api/library/*`, `app/api/manuscripts/*`, `lib/manuscripts/*` |
| Cassandra's Desk | `/desk` | `app/desk/page.tsx`, `components/kira/desk-page.tsx`, `components/kira/manual-review-form.tsx`, `components/kira/approval-card.tsx`, `components/kira/evidence-drawer.tsx`, `components/kira/context-help.tsx`; state in `lib/db/demo-store.tsx`, rules in `lib/agents/approvals.ts` |
| Ask Raven (Studio) | `/studio`, `/studio/[id]` | `app/studio/page.tsx`, `app/studio/[id]/page.tsx`, `components/kira/studio-page.tsx`, `lib/ai/studio-contract.ts` |
| Learn & Create | `/learn` | `app/learn/page.tsx`, `components/kira/learn-page.tsx`, `lib/data/agent-recipes.ts` |
| Marketing Plans | `/plans`, `/plans/[id]` | `app/plans/*`, `components/kira/plans-page.tsx`, `components/kira/plans.css`, `lib/strategy/contract.ts` |
| Catalog Opportunities | `/opportunities` | `app/opportunities/page.tsx`, `components/kira/opportunities-page.tsx`, `lib/catalog/opportunities.ts` |
| Ads & Next Steps | `/ads` | `app/ads/page.tsx`, `components/kira/ads/*` |
| Connections | `/connections` | `app/connections/page.tsx`, `components/kira/connections-page.tsx` |
| Access | `/access` | `app/access/page.tsx`, `components/kira/access-page.tsx` |
| Settings | `/settings` | `app/settings/page.tsx`, `components/kira/settings-page.tsx`, `components/kira/setup-status.tsx`, `components/kira/password-settings.tsx` |
| Auth: login, welcome (one-time link), sign-in form | `/login`, `/welcome` | `app/login/page.tsx`, `components/kira/login-form.tsx`, `app/welcome/page.tsx`, `components/kira/one-time-sign-in.tsx`, `app/auth/*` |
| Future-module previews | `/reader-pulse`, `/social`, `/discoverability`, `/hunt`, `/campaigns`, `/outreach`, `/vault` | `app/[module]/page.tsx` |
| Design system | — | `app/globals.css` (3688 lines; tokens at top, 17 media queries), `components/ui/*` (button, card, dialog, sheet, tabs, input, textarea, badge, skeleton, separator) |
| Seed / copy data | — | `lib/data/seed.ts`, `lib/data/inspiration.ts`, `lib/data/agent-recipes.ts` |

## Existing tests that pin copy or behavior (changes must keep these green or update them deliberately)
- `tests/e2e/workspace.spec.ts` (demo mode, desktop + iPhone 13): expects heading "Good afternoon, Cassandra." on `/`; six DEMO badges in region "Demo metrics"; text "MANUAL SNAPSHOT"; button "Show me why"; heading "Synthetic reader-language sample"; button "Prepare campaign"; status "Campaign brief prepared"; heading "Explore the devotion signal"; buttons "Edit", "Save draft", "Teach Raven", "Save lesson", "Approve", "Confirm approval", "Reject", "Confirm rejection"; label "Campaign or review brief"; label "What should Raven remember?"; status contains "Nothing has been published or sent"; tab /Reviewed/; text "Decision recorded"; button "Export decisions" downloads `kira-os-demo-workspace.json`; text "Rejected · Kept for audit history"; button "Not today"; heading "Devotion has their attention."; button /Restore set-aside/; button "Refresh demo briefing"; status "No live sources were queried"; 8 `.book-card`s; filter button "My Alpha Team"; label "Search catalog"; heading "Assassin’s Refusal"; tab "Characters" contains "NEEDS VERIFICATION" and "Nothing has been inferred"; tab "Purchase Links" link "Visit official collection"; button "Search workspace"; label "Search books, briefs and pages"; link "Crazy People Book"; button "Open navigation" (mobile); link "Settings"; heading "The creative firewall"; text "Prohibited" ×4; axe wcag2a/2aa/21aa clean on `/`, `/universe`, `/desk`, `/settings`; text /This module is a roadmap preview/ on each preview route; 404 heading "This chapter isn’t here."
- `tests/e2e/experience.spec.ts`: banner button "Find a spark"; dialog "A little inspiration"; `.inspiration-reel` headings "The book you still think about." / "Something beautiful, already yours." / "A little closer to your readers."; group "Filter inspiration ideas" button "Readers"; link /Read the source in .+ at Project Gutenberg \(opens in a new tab\)/; button "Open workspace guide"; dialog "Make yourself at home." contains "You are exploring a demo"; button "I’ve got it"; link "Use this idea"; label "Give it a title" prefilled "Reintroduce a title I love"; `#manual-draft-state` contains "Not saved yet"; label "Your idea"; button "Save for review"; localStorage key `kira-os:phase-one:v1`.
- `tests/e2e-connected/*` run only against a real Supabase fixture (not runnable here) but pin connected-mode copy; read them before changing connected copy and update them in the same change when copy moves.
- Unit tests in `tests/*.test.ts` pin data/logic (agent-recipes, inspiration, seed, approvals); copy in `lib/data/*` is tested.

## Scoring criteria (1–10 each; 8 = genuinely good with only minor nits; 10 = exemplary, nothing to fix)
1. **Agency & control** — who holds control and consent at each step; defaults favor her; no owner-gating that reads as permission-seeking; she can see and change what the system does with her material.
2. **Safe to experiment & undo** — drafts protected, reversibility, destructive/irreversible actions framed honestly and protected, no silent data loss, clear save state.
3. **Clarity & self-explanation** — explains itself without jargon; states are legible (empty/loading/error); honest about live vs demo vs manual snapshot; no unexplained internal vocabulary.
4. **Tone & dignity** — peer-level, not condescending or cutesy; treats her as the expert; no infantilizing metaphors; no gendered assumptions; consistent voice.
5. **Respect for creative material** — manuscript permission, spoiler controls, provenance, what happens to her file, ability to take it back; "your work" reads as hers.
6. **Visual craft & warmth** — typography, hierarchy, spacing, color, dark-theme craft, empty/loading/error states, mobile layout; delight without kitsch.
7. **Accessibility** — real WCAG 2.2 AA: labels, focus, keyboard, contrast, motion, touch targets, text size, live regions.
8. **Trust & honesty** — no dark patterns, no fake status, provenance visible, claims match implementation.

## Judge rules
- Score the code **as it actually is** in the working tree. Read the files. Cite `path:line` for every claim. Do not grade intent, changelogs, or docs.
- Be adversarial and hard to please. Do not inflate. A criterion earns 8 only if you would be comfortable putting your name on it in front of a demanding peer. If you find a real problem, the score is below 8; say exactly what would fix it.
- Every finding must be actionable and file-anchored, with the proposed change. Prefer fixes that respect the hard product rules above.
- Distinguish "fixable in code tonight" from "needs a product/role decision by the owner" (e.g. who can approve marketing plans is a role decision; how the gate is explained is code).
