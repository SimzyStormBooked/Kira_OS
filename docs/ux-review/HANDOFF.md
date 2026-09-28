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

1. **D1 Plan approval — decided, not yet applied.** Michael chose to make Cassy the Owner, which also resolves D3 for her. `docs/ownership-transfer.md` has the transaction, verification and rollback. It has not been run: it changes live data and needs credentials this repository does not hold.
2. **D2 Manuscript removal — reframed as withdrawal.** Michael pushed back on the deletion premise, correctly: storage deletion is deliberately blocked by policy (`202609190001_manuscript_intelligence.sql:473`) as part of the immutability design, not an oversight to route around, and Cassy's real need is control over who can read a version, not erasing bytes. `manuscript-withdrawal-scope.md` scopes a reversible "withdraw this version" control built on `books.active_manuscript_id` instead: findings, search and cited passages stop appearing; the file, extracted text and audit trail stay; she can bring it back herself. Not implemented — it is permissions-adjacent (decides who can hide material from the whole workspace) and needs an explicit go-ahead the same way D3 did, plus one open call on whether it's owner-only or owner-and-editor. Today she can still download a version and file a removal request brief for the rare true-deletion case, which this design keeps rather than replaces.
3. **D3 Member visibility — still open for non-owners.** Making Cassy the Owner lets *her* see the roster, but any future Editor or Viewer still cannot before uploading a manuscript. Relaxing `workspace_access_list` from `owns_author` to `can_read_author` (mutations stay owner-only) was drafted and then backed out: a permission guard flagged it as weakening an authorization gate, which is a fair call for an unattended session. It needs an explicit go-ahead. `tests/access-database.test.ts` asserts the current owner-only contract and would need updating in the same change.
4. **D4 Idempotent saves — done.** `create_manual_review` takes a client-supplied id, locks on it and returns the existing brief on a retry. Migration `202609280001_idempotent_manual_review.sql`; covered by `tests/connected-database.test.ts`.
5. **D5 Light theme.** None exists; the palette is dark-only by choice.
6. **D6 Per-tab drafts — confirmed.** Implemented in `sessionStorage`, Zod-validated, cleared on sign-out and session end. Michael approved this reading of AGENTS.md rule 12 (per-tab, not durable, never a process-wide singleton).

Known judge asks not yet done, all code-fixable: the ads stylesheet keeps some literal colors because mapping them to tokens drops below 3:1; several touched files were already unformatted at HEAD and were left that way (`npm run check` does not run Prettier).

The four gaps left by the interrupted fix round are now closed (see the commit after `8c0d9be`): control-boundary contrast, `color-scheme`, the 12px text floor and the contradictory demo metric. `--border` deliberately stays at `#33342c`: it paints card edges and separators, which are decorative and exempt from WCAG 1.4.11. Control boundaries use `--input` (`#6f7264`, 3.78:1 on the page and 3.55:1 on a card), which the shadcn primitives, the native selects and the custom checkbox all read.

## If you pick this up

Read `spec.md` top to bottom first: the non-negotiables, the six workstreams with disjoint file ownership, and the fix-round guidance section that settles conflicts between judge asks and deliberate product choices (keep the page names, keep the greeting "Cassandra", never print the owner's first name, never invent a display name from an email). `brief.md` lists the pinned test strings. Round-2 verdicts in `round2/*.json` carry the remaining must-fix items with file and line anchors.
