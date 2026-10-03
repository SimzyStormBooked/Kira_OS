import "server-only";
import type { WorkspaceResume } from "./workspace-resume";

// Public photographs already published by this author. Never use these as a
// different workspace's cast, a manuscript finding, or promotional clearance.
const kiraAuthorId = "10000000-0000-4000-8000-000000000001";
const source = "https://www.kirastanleyauthor.com/product-page/syndicate-mafia-character-stickers";
const cast = ["Rayla", "Avery", "Cosmo", "Ax", "Lex", "Falcon"];
export function authorArtwork(authorId: string): WorkspaceResume["artwork"] {
  if (authorId !== kiraAuthorId) return [];
  return cast.map(name => ({
    id: `published-${name.toLowerCase()}`, name,
    image_url: `/artwork/kira/${name.toLowerCase()}.jpg`,
    alt: `${name}'s illustrated character sticker, photographed for Kira Stanley's published shop`,
    collection: "Syndicate Mafia", source_url: source,
  }));
}
