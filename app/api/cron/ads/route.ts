import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { z } from "zod";
import { adsWorker, emailReady } from "@/lib/ads/repository";
import { refreshAdsInBackground, deliverPendingAdReport } from "@/workflows/ads-report";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, actual = request.headers.get("authorization") ?? "", expected = `Bearer ${secret}`;
  if (!secret || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const ids = z.uuid().array().max(100).parse(await adsWorker("schedule"));
    for (const id of ids) await start(refreshAdsInBackground, [id]);
    const pending = emailReady() ? z.uuid().array().max(100).parse(await adsWorker("pending_emails")) : [];
    for (const id of pending) await start(deliverPendingAdReport, [id]);
    return Response.json({ started: ids.length, pendingEmails: pending.length });
  } catch { return Response.json({ error: "Report dispatch needs attention." }, { status: 503 }); }
}
