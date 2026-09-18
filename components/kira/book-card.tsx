import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Book } from "@/types/domain";
import { series } from "@/lib/data/seed";
export function BookCover({
  book,
  large = false,
}: {
  book: Pick<Book, "title" | "accent">;
  large?: boolean;
}) {
  return (
    <div
      className={`book-cover cover-${book.accent} ${large ? "cover-large" : ""}`}
    >
      <div className="cover-border" />
      <span className="cover-top">THE KIRA STANLEY COLLECTION</span>
      <div className="cover-ornament" aria-hidden="true">
        <span>✦</span>
      </div>
      <div className="cover-title">{book.title}</div>
      <span className="cover-author">KIRA STANLEY</span>
      <span className="cover-placeholder">
        CATALOG PLACEHOLDER · NOT OFFICIAL COVER
      </span>
    </div>
  );
}
export function BookCard({ book }: { book: Book }) {
  return (
    <Link href={`/universe/${book.slug}`} className="book-card">
      <BookCover book={book} />
      <div className="book-card-info">
        <span className="eyebrow">
          {series.find((s) => s.id === book.series_id)?.name} /{" "}
          {String(book.series_order).padStart(2, "0")}
        </span>
        <h3>
          {book.title}
          <ArrowUpRight size={17} />
        </h3>
        <span className="verification-label">
          <i />
          Metadata needs verification
        </span>
      </div>
    </Link>
  );
}
