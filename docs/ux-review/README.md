# UX review · women-first pass (September 2026)

Artifacts of an adversarial UX judging board run on KIRA OS before Cassy’s first session. These are review records, not product claims; the product’s behavior is documented in the root `README.md` and `ARCHITECTURE.md`.

- `brief.md` — the shared brief the judges worked from: who the people are, the ask (Bumble as the reference for building around women’s actual experience and agency), the hard product rules, the surface→file map, the pinned tests, the eight criteria and the judge rules.
- `round1-scorecard.md` — round-1 scores for six judges across eight criteria, the consensus findings, what must not be touched, and the owner decisions surfaced.
- `round1/*.json` — each judge’s full verdict: per-criterion score, verdict, file:line evidence, the changes needed to reach 8, prioritized top findings, and what works.
- `spec.md` — the prioritized implementation spec derived from the panel, split into six workstreams with disjoint file ownership, plus the verification and round-2 procedure.

Method: parallel independent judges (a working novelist, a woman burned by products that lost her work, an accessibility specialist, a product designer with a Bumble-style empowerment lens, a skeptic hunting condescension and dark patterns, a visual craft critic) score the code as it is, not the intent; fixes are implemented; the same panel re-judges; loop until every score is at least 8 or the remaining gap is shown to need an owner decision rather than code.
