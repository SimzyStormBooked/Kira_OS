/**
 * Resolves a model's re-quote of a passage back to the exact text stored for that passage.
 *
 * Extracted PDF text carries the page's line breaks and column padding: in the current
 * production manuscript 601 of 602 stored passages contain a newline and 357 contain a
 * double space. A model asked for a verbatim quote returns the same words with ordinary
 * spacing, so an exact substring check rejects a citation that is genuinely present.
 *
 * Matching therefore ignores differences in whitespace RUNS only. Nothing else is
 * normalized: letters, case, punctuation, digits and word order must match exactly, so
 * paraphrased or altered wording is still rejected. What gets stored is never the model's
 * spacing — it is the verbatim span from the stored passage, which keeps every citation a
 * literal substring of its source and keeps the database's exact-match check meaningful.
 */

/** The model may quote this many characters of content, as its instructions state. */
export const MANUSCRIPT_QUOTE_MAX = 300;
/**
 * The stored verbatim span is longer than the content the model quoted, because the
 * source's own line breaks and column padding sit inside it. Measured against the real
 * manuscript, whitespace inflates a span by up to 4.8x, so a quote at the content limit
 * can need well over a thousand characters of raw room. The ceiling exists only to bound
 * storage: what a citation may carry away is limited by the CONTENT cap above, which no
 * amount of whitespace relaxes.
 */
export const MANUSCRIPT_STORED_QUOTE_MAX = 2000;

/** Unicode whitespace, which is what `\s` already covers, including NBSP and BOM. */
const WHITESPACE = /\s+/g;

export function normalizeQuoteWhitespace(value: string): string {
  return value.replace(WHITESPACE, " ").trim();
}

/**
 * Builds the normalized form of `source` alongside a map from each normalized character
 * back to its index in the original, so a match can be reported as original offsets.
 */
function indexNormalized(source: string) {
  let normalized = "";
  const origin: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) { pendingSpace = normalized.length > 0; continue; }
    if (pendingSpace) { normalized += " "; origin.push(index); pendingSpace = false; }
    normalized += character; origin.push(index);
  }
  return { normalized, origin };
}

export type ResolvedCitation = { quote: string; start: number; end: number; occurrences: number };

/**
 * Returns the verbatim span of `source` that the quote refers to, or null when the quote
 * is not present in the source at all, or when the span that would be stored exceeds the
 * stored cap. A quote that matches in more than one place resolves to the first match:
 * the citation records text rather than an offset, and a line repeated in a manuscript is
 * legitimate evidence, so a repeat is not a reason to discard a finding.
 */
export function resolveCitationQuote(source: string, quote: string): ResolvedCitation | null {
  const wanted = normalizeQuoteWhitespace(quote);
  if (!wanted || wanted.length > MANUSCRIPT_QUOTE_MAX) return null;
  const { normalized, origin } = indexNormalized(source);
  const at = normalized.indexOf(wanted);
  if (at < 0) return null;
  let occurrences = 0;
  for (let from = at; from >= 0; from = normalized.indexOf(wanted, from + 1)) occurrences += 1;
  const start = origin[at];
  const end = origin[at + wanted.length - 1] + 1;
  const verbatim = source.slice(start, end);
  if (verbatim.length > MANUSCRIPT_STORED_QUOTE_MAX) return null;
  // The span must carry exactly the requested words. This re-checks the index mapping
  // itself, so any way of landing on the wrong characters — including a span that split a
  // surrogate pair — resolves to nothing rather than to a quote the source does not support.
  if (normalizeQuoteWhitespace(verbatim) !== wanted) return null;
  return { quote: verbatim, start, end, occurrences };
}

/** True when the quote is supported by the source, ignoring only whitespace runs. */
export function citationIsSupported(source: string | undefined, quote: string): boolean {
  return source !== undefined && resolveCitationQuote(source, quote) !== null;
}
