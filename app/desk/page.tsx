import { DeskPage } from "@/components/kira/desk-page";
export const metadata = { title: "Cassandra’s Desk" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string | string[]; brief?: string | string[] }>;
}) {
  const { idea, brief } = await searchParams;
  const briefId = typeof brief === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brief)
    ? brief.toLowerCase() : undefined;
  return <DeskPage ideaId={typeof idea === "string" ? idea : undefined} briefId={briefId} />;
}
