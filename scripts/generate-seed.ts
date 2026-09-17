import { writeFileSync } from "node:fs";
import {
  agents,
  author,
  books,
  findings,
  initialApprovals,
  instagramSnapshot,
  seedId,
  seedTime,
  series,
  sources,
  tactics,
  universe,
} from "../lib/data/seed";
import { prioritizeFindings } from "../lib/agents/raven";

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
function valueSql(value: unknown, key: string): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number")
    return String(value);
  if (Array.isArray(value) && ["source_ids", "verified_fields"].includes(key))
    return `ARRAY[${value.map((v) => quote(String(v))).join(",")}]::${key === "source_ids" ? "uuid" : "text"}[]`;
  if (typeof value === "object")
    return `${quote(JSON.stringify(value))}::jsonb`;
  return quote(String(value));
}
const lines = [
  "-- Generated from lib/data/seed.ts by npm run db:seed:generate.",
  "-- Local/demo setup only. No auth users or credentials are seeded.",
  "-- The seed author has no owner and is inaccessible via the authenticated API until an administrator assigns one.",
  "begin;",
];
function insert(table: string, row: Record<string, unknown>) {
  const record = {
    ...row,
    created_at: row.created_at ?? seedTime,
    updated_at: row.updated_at ?? seedTime,
  };
  lines.push(
    `insert into public.${table} (${Object.keys(record).join(", ")}) values (${Object.entries(
      record,
    )
      .map(([k, v]) => valueSql(v, k))
      .join(", ")}) on conflict do nothing;`,
  );
}
insert("authors", {
  id: author.id,
  name: author.name,
  website: author.website,
  instagram_handle: author.instagram,
  data_origin: author.data_origin,
});
for (const source of sources)
  insert("sources", { ...source, author_id: author.id });
insert("universes", { ...universe });
for (const [i, s] of series.entries())
  insert("series", {
    id: s.id,
    author_id: author.id,
    universe_id: universe.id,
    source_id: seedId(12 + i),
    name: s.name,
    verification_notes: s.note ?? null,
    data_origin: s.data_origin,
  });
for (const b of books)
  insert("books", {
    id: b.id,
    author_id: author.id,
    series_id: b.series_id,
    source_id: b.source_id,
    slug: b.slug,
    title: b.title,
    series_order: b.series_order,
    verified_at: b.verified_at,
    verified_fields: ["title", "series_order"],
    verification_status: "partial",
    data_origin: b.data_origin,
  });
insert("social_accounts", {
  id: seedId(100),
  author_id: author.id,
  source_id: seedId(15),
  platform: "instagram",
  handle: author.instagram,
  followers: instagramSnapshot.followers,
  posts: instagramSnapshot.posts,
  snapshot_at: null,
  is_live: false,
  data_origin: "manual",
});
for (const a of agents)
  insert("agent_definitions", {
    id: a.id,
    author_id: author.id,
    name: a.name,
    role: a.role,
    provider: "demo",
    model: a.mode === "deterministic" ? "deterministic-v1" : null,
    mode: a.mode,
    data_origin: "demo",
  });
for (const f of findings)
  insert("agent_findings", { ...f, author_id: author.id });
for (const r of prioritizeFindings(findings, seedTime))
  insert("agent_recommendations", { ...r, author_id: author.id });
for (const a of initialApprovals)
  insert("approval_requests", { ...a, author_id: author.id });
for (const t of tactics)
  insert("tactic_memory", { ...t, author_id: author.id });
lines.push("commit;", "");
writeFileSync("supabase/seed.sql", lines.join("\n"));
console.log("Generated supabase/seed.sql from the application seed.");
