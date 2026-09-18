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
export function UniverseCard() {
  return (
    <Card className="universe-card">
      <div className="universe-card-symbol">
        <Layers3 size={26} strokeWidth={1} />
      </div>
      <div>
        <span className="eyebrow">ONE AUTHOR. A WORLD OF POSSIBILITIES.</span>
        <h2>{universe.name}</h2>
        <p>Eight sourced titles. A home for the details you want to keep.</p>
      </div>
      <div className="universe-counts">
        <div>
          <strong>08</strong>
          <span>Catalog titles</span>
        </div>
        <div>
          <strong>03</strong>
          <span>Series / collections</span>
        </div>
      </div>
    </Card>
  );
}
export function UniverseCatalog() {
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
          <p>Your worlds deserve a memory as devoted as your readers.</p>
        </div>
        <span className="heading-note">
          <ShieldCheck size={17} />
          Titles sourced from the author’s site
        </span>
      </div>
      <ContextHelp kind="universe" />
      <UniverseCard />
      <div className="catalog-toolbar">
        <div className="catalog-filters" aria-label="Filter by series">
          <Button
            variant={filter === "all" ? "secondary" : "ghost"}
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
          >
            All titles <span>8</span>
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
        organizes the author’s work; it does not assert that separate series
        share a fictional world.
      </div>
    </>
  );
}
