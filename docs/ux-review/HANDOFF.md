# Handoff · KIRA OS women-first UX work

Branch `claude/kira-ux-women-users`, head `82e0320`. No PR opened. Tree clean, everything pushed.

## State right now

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, 515 unit/db tests, production build) | green |
| `npm run test:e2e` (demo, desktop + iPhone 13) | 20/20 |
| `npm run test:e2e:connected` (against the loopback Supabase fixture) | 112/112 |

Judging ran two full rounds. Round 1 scored 3–7 across six judges; round 2 scored 5–8. A third round was planned but the run was stopped to control cost, so the panel has **not** re-scored the latest commit (`82e0320`), which closes most of what round 2 asked for. Scores per judge per criterion are in `round1-scorecard.md` and `round2/*.json`.

## Running the browser tests in a fresh container

Playwright 1.63 expects browsers the image does not provide at that version. Recreate the symlink tree once, then pass it in:

```bash
PW=/tmp/pw-browsers
mkdir -p $PW/chromium_headless_shell-1243/chrome-headless-shell-linux64 $PW/chromium-1243/chrome-linux64
ln -sfn /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
        $PW/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
ln -sfn /opt/pw-browsers/chromium-1194/chrome-linux/chrome $PW/chromium-1243/chrome-linux64/chrome
ln -sfn /opt/pw-browsers/ffmpeg-1011 $PW/ffmpeg-1011
touch $PW/chromium_headless_shell-1243/INSTALLATION_COMPLETE $PW/chromium-1243/INSTALLATION_COMPLETE
PLAYWRIGHT_BROWSERS_PATH=$PW npm run test:e2e
npm run build && PLAYWRIGHT_BROWSERS_PATH=$PW npm run test:e2e:connected
```

Ports 3100 (demo dev), 3102 (connected prod) and 3107 (fixture) must be free; the suites start their own servers. `next dev` rewrites `next-env.d.ts` — `git checkout -- next-env.d.ts` before committing. Screenshot helpers live in `work/` (gitignored); launch Chromium with `executablePath: "/opt/pw-browsers/chromium"`.

## What is still open

Owner decisions (D1–D6 in `spec.md`) are unimplemented by design. Each has honest copy in the UI today instead of a silent limit:

1. **D1 Plan approval.** Plans enter owner review automatically; only the owner approves and activates. Decide whether Cassy becomes Owner, editors approve their own plans, or the gate narrows to plans with spend. SQL: `202609190002_strategy_plans.sql`.
2. **D2 Manuscript removal.** Storage deletion is blocked by policy (`202609190001_manuscript_intelligence.sql:473`) and derived rows are guarded. Needs a migration, an RPC and a DELETE route. Today she can download a version and file a removal request brief.
3. **D3 Member visibility.** `workspace_access_list` checks `owns_author`, so editors cannot see who can read the workspace. Copy names the exposure and links to `/access`.
4. **D4 Idempotent saves.** `create_manual_review` takes no client id, so a lost response plus retry can duplicate a brief.
5. **D5 Light theme.** None exists; the palette is dark-only by choice.
6. **D6 Per-tab drafts.** Implemented in `sessionStorage`, Zod-validated, cleared on sign-out and session end. Confirm that reading of AGENTS.md rule 12.

Known judge asks not yet done, all code-fixable: plan-form fields are registered with the draft registry but the Plans page still lacks the skeleton loading treatment; the ads stylesheet keeps some literal colors because mapping them to tokens drops below 3:1; several touched files were already unformatted at HEAD and were left that way (`npm run check` does not run Prettier).

## If you pick this up

Read `spec.md` top to bottom first: the non-negotiables, the six workstreams with disjoint file ownership, and the fix-round guidance section that settles conflicts between judge asks and deliberate product choices (keep the page names, keep the greeting "Cassandra", never print the owner's first name, never invent a display name from an email). `brief.md` lists the pinned test strings. Round-2 verdicts in `round2/*.json` carry the remaining must-fix items with file and line anchors.
