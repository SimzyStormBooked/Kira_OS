# Round 1 scorecard · women-first UX review of KIRA OS

Judged against the working tree at `131c4ed` (branch `claude/kira-ux-women-users`), 20 September 2026. Six independent judges (Claude Opus 5, high effort) read the components, the store, the seed data, the CSS and rendered screenshots of demo and connected mode at desktop and iPhone widths. Each scored eight criteria 1–10, where 8 means "genuinely good, minor nits only". Full verdicts with file:line evidence are in `round1/*.json`.

| Judge | Agency | Undo/safety | Clarity | Tone | Creative material | Visual craft | Accessibility | Trust | Mean |
|---|---|---|---|---|---|---|---|---|---|
| Nora · working novelist | 3 | 5 | 5 | 4 | 4 | 5 | 4 | 5 | 4.4 |
| Dana · burned by lost work | 5 | 3 | 5 | 6 | 4 | 7 | 6 | 5 | 5.1 |
| Priya · accessibility | 6 | 6 | 5 | 6 | 7 | 4 | 4 | 6 | 5.5 |
| Maya · Bumble-lens designer | 3 | 5 | 6 | 4 | 4 | 6 | 6 | 6 | 5.0 |
| Theo · condescension & dark patterns | 4 | 6 | 5 | 3 | 5 | 6 | 6 | 4 | 4.9 |
| Ines · visual craft | 6 | 6 | 5 | 6 | 6 | 4 | 5 | 6 | 5.5 |
| **Panel mean** | 4.5 | 5.2 | 5.2 | 4.8 | 5.0 | 5.3 | 5.2 | 5.3 | |
| **Panel min** | 3 | 3 | 5 | 3 | 4 | 4 | 4 | 4 | |

48 of 48 scores are below the bar of 8.

## What every judge agreed on

1. **Her own marketing plan waits on a named man.** Plans become "Needs owner review" automatically; only the owner can approve or activate; the UI says "Michael can review this plan and activate its tasks." (`components/kira/plans-page.tsx`). The framing is code; who holds the gate is an owner decision.
2. **Her manuscript has no exit and an under-informed consent.** No delete route or control exists and SQL forbids deleting the stored file; the checkbox names "Kira’s AI services" but the passages go through Vercel AI Gateway to Google Gemini and OpenAI embeddings (documented in `docs/manuscript-foundation.md`, not in the UI); "Private to your workspace" is read as "only me" while every member with access can read passages.
3. **The AI wears her pen name.** "Let Kira get to know this book", "What Kira learned", "Kira reads it in small steps" — Kira is Cassy’s pen name; the workspace AI is Raven.
4. **Phantom staff.** "The minions are working. Go write. 🖤", "They bring the evidence", "YOUR BUSINESS TEAM" with WAITING/IDLE pills, and a site description saying "The agents run the business" — nothing runs, and the contract forbids fake agent status.
5. **The honesty layer is unreadable.** ~130 font-size declarations below 12px; the DEMO badge drops to 5px on phones; consent and provenance copy sits in 9–10px `quiet-note`s; inputs are 12px so iOS zooms on every focus.
6. **"A few thingsneed your instinct."** — the home hero heading collides at every width ≤1020px because a hidden `<br>` carried the only space.
7. **Drafts are protected until they aren’t.** A background 401 on window focus wipes every unsaved draft and redirects; Escape in the Edit dialog discards a rewrite; nothing survives a reload or a discarded mobile tab.
8. **Third person in her own workspace.** Seeded briefs say "First confirm audience fit with Cassandra"; the sidebar shows two identities with no link between them; "Human in command" is a slogan, not her role.
9. **Screen readers get the harder product.** Nav `aria-label`s hide the descriptions and the pending count; the manuscript progress card re-announces on every poll; "Guide" is named "Open workspace guide"; error toasts show a check mark.

## What the judges said must not be touched

Draft-protection choreography (keep-or-replace dialogs, sign-out confirmation, the guard that refuses to clear words typed after a save), version-conflict detection on decisions, focus management after every dialog and error, spoiler defaults and hidden-count disclosure, passage-level citations, background reading with pause/resume, the provenance badge system, the Cormorant/Manrope typography and palette, the daily verified quote, the inspiration content.

## Owner decisions surfaced

See `spec.md` → *Owner decisions* (D1 plan approval, D2 manuscript removal, D3 member visibility for editors, D4 idempotent saves, D5 light theme, D6 per-tab draft persistence).
