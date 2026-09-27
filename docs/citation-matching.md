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

## Raven's plan and context quotes — September 23, 2026

Manuscript citations flow on into the evidence Raven reads. `private.book_reference_context` turns each supported finding into an evidence item that ends `Supporting passage: <its first citation>`, and both Marketing Plans and Ask Raven ask the model to quote that evidence exactly. Both then checked the quote with an exact substring test and a raw length cap — `private.strategy_valid_output` and `lib/strategy/contract.ts` for plans, `private.valid_studio_output` and `lib/ai/studio-contract.ts` for Ask Raven.

Once citations kept their passage's line breaks, a book read after that change would have had every re-spaced Raven quote of its passages rejected. Nothing wrong would have been saved — each failure is closed — but a plan or answer about a newly read book would have failed outright, on a paid call. `202609260001_raven_evidence_quotes.sql` and the matching application change apply the same design used for manuscript citations: resolve the quote against one source ignoring whitespace runs, store that source's own text, and bound content (300 for plans, 400 for Ask Raven) rather than raw length. Saved plans, activated tasks, stored Ask Raven answers and ads report snapshots are all read back through a stored form that accepts those spans, while the model is still told 300 and 400.

Tolerant matching makes one thing newly dangerous, so it is closed at the same time. Ask Raven's reference text joined the question and every evidence item with a newline, and its quotes were checked against the whole joined text. Whitespace tolerance would have let a normally spaced quote run from the end of one source into the start of the next — words that are adjacent in neither. Sources are now joined around U+001E, which the manuscript parser deletes from every format and which is not whitespace, so no match can bridge it and a quote containing it is refused. In the same way, a span containing `Supporting passage:` runs from Raven's own finding into the author's words and is refused as a quote of either.

`workspace_generations.studio_context_result_valid` checks every stored answer against these functions. Before the change all 20 stored context references were verified to sit inside a single source, and the migration refuses to apply if any stored answer would fail the new check, so no existing row can later be refused on update.

An earlier version of this note placed the joined-quotes hazard in Marketing Plans. That described `private.strategy_begin` as first written; `202609190003_studio_book_context.sql` had already replaced its evidence builder, and the hazard lived in Ask Raven's reference text instead.

What remains, deliberately:

- Owner review feedback given to a plan is up to three reviews joined by newlines, and a book's metadata item joins its title, overview and metadata the same way. A quote may run across those lines. They are the author's own words throughout, so this cannot misattribute her manuscript, and it is left as it was.
- A quote matching more than one place resolves to the first. If that first match crosses a seam or label while a later one does not, the quote is refused rather than resolved to the later match — closed, and rare.
- Plan output is capped at 64000 bytes and Ask Raven output at 30000. Longer stored quotes consume more of those caps; an output that exceeded one would fail closed.
