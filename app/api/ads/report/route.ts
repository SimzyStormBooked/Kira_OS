import { z } from "zod";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { adsSnapshotSchema } from "@/lib/ads/contract";
import { adsPreview } from "@/lib/ads/preview";
import { renderAdsEmail } from "@/lib/ads/email";
import { adsFailure, adsHeaders } from "@/lib/ads/http";
import { parseApplicationOrigin } from "@/lib/config";
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession(), params = new URL(request.url).searchParams;
    let snapshot = adsPreview(); let reportUrl = `${parseApplicationOrigin(process.env.NEXT_PUBLIC_APP_URL ?? "")}/ads`;
    if (params.get("preview") !== "true") {
      const id = z.uuid().parse(params.get("id")); const { data, error } = await session.supabase.from("ads_reports").select("snapshot").eq("author_id", session.authorId).eq("id", id).single();
      if (error) return Response.json({ error: "Report unavailable." }, { status: 404, headers: adsHeaders });
      snapshot = adsSnapshotSchema.parse(data.snapshot); reportUrl += `?report=${id}`;
    }
    const rendered = renderAdsEmail(snapshot, reportUrl, `${reportUrl.split("?")[0]}#delivery`);
    return new Response(rendered.html, { headers: { ...adsHeaders, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'" } });
  } catch (error) { return adsFailure(error); }
}
