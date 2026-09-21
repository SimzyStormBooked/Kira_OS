import { requireWorkspaceSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { importAdsCsv } from "@/lib/ads/csv";
import { adsControl, loadAdsView } from "@/lib/ads/repository";
import { adsFailure, adsHeaders } from "@/lib/ads/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const session = await requireWorkspaceSession();
    if (Number(request.headers.get("content-length") ?? "0") > 2_100_000) return Response.json({ error: "Choose a CSV under 2 MB." }, { status: 413, headers: adsHeaders });
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size > 2_000_000 || !file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "Choose a CSV under 2 MB." }, { status: 400, headers: adsHeaders });
    let snapshot;
    try { snapshot = importAdsCsv(await file.text(), String(form.get("since")), String(form.get("until")), String(form.get("timezone")), String(form.get("currency")), String(form.get("accountName")).slice(0,200)); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read the CSV." }, { status: 400, headers: adsHeaders }); }
    await adsControl(session.supabase, session.authorId, "import", { snapshot });
    return Response.json(await loadAdsView(), { headers: adsHeaders });
  } catch (error) { return adsFailure(error); }
}
