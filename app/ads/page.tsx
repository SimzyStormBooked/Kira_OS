import { requireWorkspaceSession } from "@/lib/auth/session";
import { loadAdsView } from "@/lib/ads/repository";
import { AdsDashboard } from "@/components/kira/ads/dashboard";
export const metadata = { title: "Ads & Next Steps" };
export default async function Page({ searchParams }: { searchParams: Promise<{ report?: string; connection?: string }> }) {
  await requireWorkspaceSession();
  const params = await searchParams;
  return <AdsDashboard initial={await loadAdsView()} requestedReport={params.report} connectionResult={params.connection} />;
}
