"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  FileCheck2,
  ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { series } from "@/lib/data/seed";
import type { Book } from "@/types/domain";
import { BookCover } from "./book-card";
import { DemoBadge } from "./origin-badge";
const sections = [
  "Overview",
  "Series",
  "Characters",
  "Relationships",
  "Tropes",
  "Themes",
  "Reader Language",
  "Reviews",
  "Marketing Assets",
  "Social Performance",
  "SEO",
  "Campaign History",
  "Products",
  "Purchase Links",
];
export function BookDetail({ book }: { book: Book }) {
  const collection = series.find((s) => s.id === book.series_id)!;
  return (
    <>
      <Link href="/universe" className="text-link back-link">
        <ArrowLeft size={14} />
        Back to The Universe
      </Link>
      <div className="book-detail-grid">
        <div>
          <BookCover book={book} large />
          <p className="cover-caption">
            Decorative placeholder. Official cover not imported.
          </p>
        </div>
        <div className="book-detail-content">
          <div className="eyebrow page-kicker">
            {collection.name} / BOOK {book.series_order}
          </div>
          <h1>{book.title}</h1>
          <p className="book-byline">By Kira Stanley</p>
          <div className="book-detail-badges">
            <DemoBadge origin="public_verified" />
            <span className="verification-label">
              <i />
              Partial record
            </span>
          </div>
          <p className="book-detail-intro">
            A place for everything this book means to your business. Start with
            what’s verified. Build the rest with intention.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Title</dt>
              <dd>{book.title}</dd>
            </div>
            <div>
              <dt>Series / collection</dt>
              <dd>{collection.name}</dd>
            </div>
            <div>
              <dt>Listed order</dt>
              <dd>Book {book.series_order}</dd>
            </div>
            <div>
              <dt>Source checked</dt>
              <dd>{book.verified_at.slice(0, 10)}</dd>
            </div>
            <div>
              <dt>Overview & genre</dt>
              <dd>NEEDS VERIFICATION</dd>
            </div>
          </dl>
          {collection.note && <p className="quiet-note">{collection.note}</p>}
          <div className="book-detail-actions">
            <Button asChild variant="outline">
              <a href={book.source_url} target="_blank" rel="noreferrer">
                View author source
                <ArrowUpRight size={14} />
              </a>
            </Button>
            <Button asChild>
              <Link href="/desk">
                <FileCheck2 size={14} />
                Cassandra’s Desk
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <Tabs defaultValue="Overview" className="book-tabs">
        <TabsList className="book-tabs-list">
          {sections.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s} value={s}>
            <Card className="book-knowledge-panel">
              {s === "Series" ? (
                <>
                  <span className="eyebrow">SOURCED COLLECTION</span>
                  <h2>{collection.name}</h2>
                  <p>
                    Listed as book {book.series_order} on the official author
                    site.
                  </p>
                  {collection.note && <p>{collection.note}</p>}
                  <a
                    href={book.source_url}
                    className="text-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify at source <ArrowUpRight size={14} />
                  </a>
                </>
              ) : s === "Purchase Links" ? (
                <>
                  <span className="eyebrow">OFFICIAL AUTHOR SITE</span>
                  <h2>Go straight to the source.</h2>
                  <p>
                    This opens the official collection page. Product
                    availability and retailer links have not been verified.
                  </p>
                  <a
                    href={book.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Visit official collection <ArrowUpRight size={14} />
                  </a>
                </>
              ) : (
                <>
                  <ShieldQuestion size={28} strokeWidth={1.2} />
                  <span className="verification-label">NEEDS VERIFICATION</span>
                  <h2>
                    {s === "Overview"
                      ? "The story belongs to Kira."
                      : `${s}, with receipts.`}
                  </h2>
                  <p>
                    {s === "Overview"
                      ? "No description has been imported. Approved author copy will become read-only reference knowledge for the business team."
                      : `No verified ${s.toLowerCase()} have been imported for this book. Nothing has been inferred from its title or cover.`}
                  </p>
                  <span className="quiet-note">
                    Future Vault ingestion will attach source documents and
                    Cassandra’s verification to this section.
                  </span>
                </>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
