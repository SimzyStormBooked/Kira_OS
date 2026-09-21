"use client";
import { useState } from "react";
import { BookOpen, Layers3, Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { books, series, universe } from "@/lib/data/seed";
import { ContextHelp } from "./context-help";
import { BookCard } from "./book-card";
import { DemoBadge } from "./origin-badge";
import { useWorkspace } from "@/lib/db/demo-store";
import { ConnectedLibrary } from "./connected-library";
export function UniverseCard() {
  return (
    <Card className="universe-card">
      <div className="universe-card-symbol">
        <Layers3 size={26} strokeWidth={1} />
      </div>
      <div>
        <span className="eyebrow">ONE AUTHOR. A WORLD OF POSSIBILITIES.</span>
        <h2>{universe.name}</h2>
        <p>{books.length} sourced titles. Open a book to review its source or prepare approved details.</p>
      </div>
      <div className="universe-counts">
        <div>
          <strong>{books.length}</strong>
          <span>Catalog titles</span>
        </div>
        <div>
          <strong>{series.length}</strong>
          <span>Series / collections</span>
        </div>
      </div>
    </Card>
  );
}
export function UniverseCatalog() {
  const { mode } = useWorkspace();
  return mode === "connected" ? <ConnectedLibrary /> : <DemoUniverseCatalog />;
}
function DemoUniverseCatalog() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = books.filter(
    (b) =>
      (filter === "all" || b.series_id === filter) &&
      b.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow page-kicker">YOUR BOOKS / THE UNIVERSE</span>
          <h1>
            Every book.
            <br />
            <em>Every possibility.</em>
          </h1>
          <p>Find a book, check its source, and gather the details you want to add.</p>
        </div>
        <span className="heading-note">
          <ShieldCheck size={17} />
          Titles sourced from your author site
        </span>
      </div>
      <ContextHelp kind="universe" />
      <UniverseCard />
      <div className="catalog-toolbar">
        <div className="catalog-filters" role="group" aria-label="Filter by series">
          <Button
            variant={filter === "all" ? "secondary" : "ghost"}
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
          >
            All titles <span>{books.length}</span>
          </Button>
          {series.map((s) => (
            <Button
              key={s.id}
              variant={filter === s.id ? "secondary" : "ghost"}
              onClick={() => setFilter(s.id)}
              aria-pressed={filter === s.id}
            >
              {s.name}
            </Button>
          ))}
        </div>
        <div className="catalog-search">
          <Search size={15} />
          <Input
            aria-label="Search catalog"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a book…"
          />
        </div>
      </div>
      <div className="catalog-source-note">
        <DemoBadge origin="public_verified" />
        <span>
          Names and order are sourced. All other book knowledge needs
          verification. Decorative covers are placeholders.
        </span>
      </div>
      <div className="book-grid">
        {filtered.map((b) => (
          <BookCard key={b.id} book={b} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          <BookOpen size={35} />
          <h2>No titles found.</h2>
          <p>Try a different title or collection.</p>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <div className="catalog-footnote">
        This is a starter catalog, not a complete bibliography. “Universe”
        organizes your work; it does not assert that separate series
        share a fictional world.
      </div>
    </>
  );
}
