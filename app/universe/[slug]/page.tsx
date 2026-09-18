import { notFound } from "next/navigation";
import { books } from "@/lib/data/seed";
import { BookDetail } from "@/components/kira/book-detail";
import { ConnectedBookDetail } from "@/components/kira/connected-book-detail";
import { getWorkspaceSession, requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { bookDetailSchema } from "@/lib/manuscripts/library-contract";
import { ManuscriptError } from "@/lib/manuscripts/http";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if ((await getWorkspaceSession()).mode === "connected") return { title: "Your book library" };
  return {
    title: books.find((b) => b.slug === slug)?.title ?? "Book not found",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if ((await getWorkspaceSession()).mode === "connected") {
    const session = await requireWorkspaceSession();
    let loaded;
    try {
      const [detail, role] = await Promise.all([createManuscriptRepository(session.supabase, session.authorId).detail(slug, true), getWorkspaceRole(session)]);
      loaded = bookDetailSchema.parse({ ...detail, role });
    } catch (error) {
      if (error instanceof ManuscriptError && error.status === 404) notFound();
      throw error;
    }
    return <ConnectedBookDetail key={loaded.book.id} initial={loaded} />;
  }
  const book = books.find((b) => b.slug === slug);
  if (!book) notFound();
  return <BookDetail book={book} />;
}
