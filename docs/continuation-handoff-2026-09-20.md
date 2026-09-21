# KIRA OS continuation handoff — September 20, 2026

> September 21 update: both Claude branches are now integrated in the release checkout. Character Studio phase 1 is applied to the hosted database; the gallery/upload UI remains unbuilt. Round-one and round-two adversarial results are now in `docs/ux-review/`; round two still contains open findings. The September 20 snapshot below is historical.


## Safe starting point

All 14 existing migrations are committed on main and recorded in production. The three September 20 SQL files match their stored migration statements exactly. No database changes were needed for this checkpoint. See VERIFICATION.md and the sanitized migration-checkpoint JSON for evidence. No email delivery, ad authorization, paid AI generation, or manuscript reprocessing was triggered.

Application release 131c4ed is the latest verified deployed UX change. It replaces large nested manuscript cards with a compact index and focused panel; keeps passage groups; separates character facets; exposes deep search matches; opens supporting passages directly; and offers reviewable Raven questions or source-linked Desk notes. It protects unfinished Raven work and preserves original manuscript evidence.

## User feedback to carry forward

Michael wants the product to feel visually rewarding and intuitive, with clear answers to “what do I do with this?” The supported manuscript views now provide actionable paths, but the following broader design direction remains future work:

- Character Studio: an author-owned portrait gallery across books and universes, searchable by names and aliases, filterable by series, with notes, relationships, development and book appearances.
- Upload portraits separately from manuscript reading. Preserve images and personal notes when a manuscript is replaced.
- Distinguish author-confirmed character details, visual inspiration and manuscript-derived observations. Never treat an image as proof of a fact in the book.
- Create stable workspace-scoped character IDs and explicit book links before attaching portraits. Same names across universes do not prove identity. Cross-book links must be author-confirmed and reversible.
- Keep images private, strip location metadata, and retain source/credit and usage permission. Permission for private inspiration is separate from permission for public promotional use.
- Let authors pin their own creations on the home screen. Celebrate their actual books and characters without streaks, scores, inflated extraction counts or pressure to produce.
- Add an optional Quiet Room with a calm, accessible view and a clear return path. No new manuscript editor, fiction generation, automatic sound, or productivity target is implied.
- Useful character actions: inspect an original passage, record an author note, prepare a spoiler-safe introduction with Raven, save a marketing next step, or choose a home showcase portrait. No automatic publication.

Recommended sequence: stable character profiles and private portraits; author-selected home showcase; small optional Quiet Room. A relationship map and richer promotional design tools can follow confirmed character identity and permission handling.

The [Character Studio design preview](design/character-studio-preview.html) is retained for visual direction. It is a standalone concept, not an application feature. Celine and Brick are supplied names; portraits are placeholders and no character traits or relationships were invented. Its optional local image preview does not upload, save, or analyze images.

## Ongoing adversarial review

Michael reports a separate six-persona review still running. The supplied screenshot shows the workflow `kira-ux-judges-round1`, including novelist, burned, accessibility, humble, skeptic and craft perspectives. Its final report has not been received or accepted here. Do not state that this review has passed, assign its scores, or implement imagined findings. Fold the delivered report into a prioritized, testable change list when Michael supplies it.

The screenshot also references documentation commit `cd85039`, unpushed from a different review checkout. That commit is not present in this repository or its current main history. The exact patch could not be recovered through this account. This checkpoint independently records confirmed state; it does not claim to have cherry-picked the unseen patch. Preserve and reconcile that patch when its owner makes it available.

The screenshot’s “all three migrations unrecorded” wording is stale: the direct database check confirmed all three applied and recorded with exact SQL matches. Other screenshot claims about plan restrictions, scheduler invocations and environment-variable creation times were not re-audited in this task and must not be treated as newly verified facts.

## Deliberately deferred / external setup

- Automatic Monday/Thursday reports: owner explicitly deferred email setup. Do not enable sending or subscriptions as part of this checkpoint. Resend domain DNS/sender verification remains setup work; existing preview/report code does not prove delivery readiness.
- Meta Ads: dashboard/import/preview code exists, but developer-app credentials and consent are still activation gates. Do not imply live Facebook account analytics or advertising changes.
- Character Studio: concept only when this checkpoint was written. Phase 1 schema was added afterwards in `202609210001_character_studio.sql` (September 21) and is pending on the hosted database; there is still no upload feature, gallery, or stored image. See [character-studio.md](character-studio.md).
- Production manuscript snapshot contained one ready and one failed version; no processing was active and no retries were attempted in this migration audit. That aggregate alone does not identify a new failure or supersede the available completed knowledge.

## Review artifacts retained in the workspace

Existing notes are in outputs/KIRA_OS-UX-review.md, work/kira-ux-audit/report.json, work/kira-release-ux/report.json, and outputs/KIRA-Ad-Intelligence/BUILD-SPEC.md, relative to the task directory (not this repository). These were not newly authored review results. Some local files are managed by macOS iCloud and may need downloading before use.

The current task workspace moved from Documents/Codex to Documents/Documents - Michael’s MacBook Air/Codex. Do not assume old absolute operator-script paths still work. Keep credentials out of this repository and out of application runtime configuration.
