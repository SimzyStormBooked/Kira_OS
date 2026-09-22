# Citation matching — September 22, 2026

A citation is the whole basis for trusting a manuscript finding: the claim is only as good as the quote behind it. This note records why quote checking changed, what it still refuses, and what it still cannot do.

## The defect

Extracted PDF text keeps the page's own typesetting. `lib/manuscripts/parser.ts` appends a newline after each text item the reader flags as a line end and a space otherwise, so a stored passage carries mid-sentence line breaks, double spaces from inter-item gaps, and occasional spurious spaces from font switches. In the current production manuscript, **601 of 602 stored passages contain a newline and 357 contain a double space**.

A model asked to quote a passage verbatim returns the same words with ordinary spacing. Both checks compared the two exactly — `known.get(citation.chunk_id)?.includes(citation.quote)` in the application and `strpos(reference_text, quote) > 0` in SQL — so a citation that was genuinely present was rejected for its spacing.

Measured against the real corpus by re-quoting spans of actual passages the way the model does, the old check accepted **636 of 2401** such citations: **26.5%**. This was not an edge case. It was the common case, and it is why `Syndicate Princess` stalled at 20 of 421 passages with **31 failed batches**, each one a paid model call that saved nothing — **$0.42 spent for no stored knowledge**.

## What changed

Matching now ignores differences in whitespace RUNS, and only those. Everything else — letters, case, punctuation, digits, word order — must still match exactly, so paraphrased or altered wording is rejected exactly as before.

What gets stored is never the model's spacing. `resolveCitationQuote` maps the match back through the source and returns the **verbatim span of the passage**, so every stored citation remains a literal substring of the text it cites. That is the point of the design: the database's exact-substring requirement is left untouched and still means something, because the application only ever sends it text the source actually contains.

| Bound | Value | Why |
| --- | --- | --- |
| Content the model may quote | 300 characters, whitespace-normalized | Unchanged. What a citation may carry away is limited by words, not spacing. |
| Raw stored span | 2000 characters | The source's own line breaks sit inside the span. Whitespace inflates a span by up to **4.8x** in the real manuscript, so a quote at the content limit needs room well past 300. |

`202609210002_citation_whitespace.sql` raises the SQL raw cap and adds the normalized content cap, keeping `strpos` exact. Without it a TypeScript-only fix would still have failed in production: **173 of 2392** resolved spans exceed 300 raw characters.

Two budgets means two budgets everywhere. `manuscriptCitationSchema` carries the same pair, because every path that reads a saved profile back — the book detail page and API, `/api/opportunities`, the ads report worker — parses it with that schema. A schema that capped raw length would have let the database store rows the application could never load again.

The two normalizers must also agree on what a space is. PostgreSQL's `\s` does not match U+00A0, U+1680, U+2007, U+202F or U+FEFF, while JavaScript's does, so the SQL guard spells the class out. Otherwise a passage padded with non-breaking spaces would resolve in the application and be rejected by the database, failing the whole batch — the same defect wearing a different hat.

`resolveCitationQuote` finally re-normalizes the span it is about to return and compares it to the requested quote. Any way of landing on the wrong characters, including a span that split a surrogate pair, resolves to nothing rather than to a quote the source does not support.

A quote that matches in more than one place resolves to the first occurrence rather than being discarded. A citation records text, not an offset, and a repeated line of dialogue is legitimate evidence; in 2401 sampled resolutions this arose zero times.

## Verified

- **2401 of 2401** simulated re-quotes of real passages now resolve, against 636 before.
- Every resolved span was literally present in its source and normalized back to the requested words.
- **796** altered-wording probes — changed letters, added words, reordered words, changed case — were all rejected.
- All **852** citations already stored in production still validate unchanged, so nothing existing is invalidated.
- The largest stored batch payload is 10780 bytes against the 100000-byte cap in `private.valid_manuscript_result`.
- 28 unit tests and 4 database tests, the latter running the real SQL migration in PGlite, including one that asserts the application and the database classify the same characters as whitespace.
- Both defects found in adversarial review have a regression test that was confirmed to fail when the defect is reintroduced.

## What this still cannot do

- **Hyphenated line breaks.** A word broken across a typeset line is stored as `wa-\nterfall`. A model quoting `waterfall` is not a whitespace difference — it removes a hyphen — so it is still rejected. This is the largest remaining class of false negatives for PDFs and is deliberately out of scope: accepting it would mean accepting text the source does not contain.
- **Page furniture.** Each PDF page is its own section, so a running head or folio can sit mid-sentence inside a passage. A model that quotes across it will not match.
- **Payload ceiling.** Longer stored quotes consume more of the 100000-byte result cap. Realistic batches are far under it, and a batch that exceeded it would fail closed as `invalid_output` rather than store anything, which is the existing behaviour.

## Related hazard, not fixed here

`private.strategy_begin` builds manuscript evidence for a plan by concatenating a chunk's **distinct stored citation quotes** with newlines (`string_agg(distinct cit->>'quote', E'\n')`), then validates plan citations with `position(quote in text) > 0` against that joined text — mirrored in `lib/strategy/contract.ts`. Two adjacent quotes therefore create an adjacency the manuscript never had, and a plan citation straddling that seam would validate.

This is pre-existing and independent of whitespace. It matters more after this change only because more citations now survive validation, so a chunk contributes more quotes and more seams. The contained fix is to validate a manuscript-kind plan citation against the individual quotes rather than the joined blob, in both the SQL function and its TypeScript mirror. It is deliberately not bundled into this change.
