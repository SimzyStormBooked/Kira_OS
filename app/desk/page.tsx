import { DeskPage } from "@/components/kira/desk-page";
export const metadata = { title: "Cassandra’s Desk" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string | string[] }>;
}) {
  const idea = (await searchParams).idea;
  return <DeskPage ideaId={typeof idea === "string" ? idea : undefined} />;
}
