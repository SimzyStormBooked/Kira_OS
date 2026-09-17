import { notFound } from "next/navigation";
import { books } from "@/lib/data/seed";
import { BookDetail } from "@/components/kira/book-detail";
export const dynamicParams = false;
export function generateStaticParams() {
  return books.map((b) => ({ slug: b.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
  const book = books.find((b) => b.slug === slug);
  if (!book) notFound();
  return <BookDetail book={book} />;
}
