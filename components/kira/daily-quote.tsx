import { ArrowUpRight } from "lucide-react";
import { getDailyQuote } from "@/lib/data/inspiration";

export function DailyQuote({ dateKey, compact = false }: { dateKey?: string; compact?: boolean }) {
  const quote = getDailyQuote(dateKey);
  return (
    <figure className={`daily-quote${compact ? " daily-quote--compact" : ""}`} data-origin={quote.data_origin}>
      <span className="eyebrow">A LINE TO ARRIVE WITH</span>
      <blockquote className="daily-quote-text"><p>“{quote.text}”</p></blockquote>
      <figcaption className="daily-quote-credit">
        <span>{quote.author} <span aria-hidden="true">·</span> <cite>{quote.work}</cite></span>
        <a className="daily-quote-source" href={quote.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Read the source in ${quote.work} at Project Gutenberg (opens in a new tab)`}>
          Read the source <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      </figcaption>
      <details className="daily-quote-context">
        <summary>{quote.excerpt ? "About this excerpt" : "In the book"}</summary>
        <p>{quote.location}. {quote.context}</p>
      </details>
    </figure>
  );
}
