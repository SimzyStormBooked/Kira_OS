import { notFound } from "next/navigation";
import { z } from "zod";
import { StudioPage } from "@/components/kira/studio-page";
export const metadata = { title: "A question for Raven" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <StudioPage key={id} generationId={id} />;
}
