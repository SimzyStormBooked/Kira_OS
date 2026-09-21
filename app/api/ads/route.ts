import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { assertSameOrigin } from "@/lib/auth/security";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { adsControl, emailReady, loadAdsView } from "@/lib/ads/repository";
import { adsFailure, adsHeaders } from "@/lib/ads/http";
import { readSmallBody } from "@/lib/connections/meta-http";
import { refreshAdsInBackground } from "@/workflows/ads-report";
const adLibraryUrl = z.string().url().max(2000).refine(value => { const u = new URL(value); return u.protocol === "https:" && ["facebook.com", "www.facebook.com"].includes(u.hostname) && !u.username && !u.password && u.pathname.startsWith("/ads/library"); });
const input = z.discriminatedUnion("action", [z.object({ action: z.literal("inspiration"), title: z.string().trim().min(1).max(200), url: adLibraryUrl, note: z.string().trim().max(2000) }).strict(), z.object({ action: z.literal("remove_inspiration"), id: z.uuid() }).strict(), z.object({ action: z.literal("sync") }).strict(), z.object({ action: z.literal("disconnect") }).strict(), z.object({ action: z.literal("select"), accountId: z.string().regex(/^act_\d{1,30}$/) }).strict(), z.object({ action: z.literal("subscribe"), enabled: z.boolean() }).strict(), z.object({ action: z.literal("link"), campaignId: z.string().regex(/^\d{1,30}$/), bookId: z.uuid().nullable() }).strict()]);
export async function GET() { try { return NextResponse.json(await loadAdsView(), { headers: adsHeaders }); } catch (error) { return adsFailure(error); } }
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const session = await requireWorkspaceSession(); const body = input.parse(JSON.parse(await readSmallBody(request)));
    if (body.action === "subscribe" && body.enabled && !emailReady()) return NextResponse.json({ error: "Email delivery is not verified yet. You can use the dashboard and preview while setup finishes." }, { status: 409, headers: adsHeaders });
    const result = await adsControl(session.supabase, session.authorId, body.action, body);
    if (body.action === "sync" && result.state === "queued") await start(refreshAdsInBackground, [z.uuid().parse(result.id)]);
    return NextResponse.json(await loadAdsView(), { headers: adsHeaders });
  } catch (error) { return adsFailure(error); }
}
