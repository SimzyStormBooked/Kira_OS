import { z } from "zod";
import { verifyEmailWebhook } from "@/lib/ads/delivery";
import { adsWorker } from "@/lib/ads/repository";
import { readSmallBody } from "@/lib/connections/meta-http";
export async function POST(request: Request) {
  try {
    const raw = await readSmallBody(request); const eventId = verifyEmailWebhook(raw, request.headers, process.env.RESEND_WEBHOOK_SECRET ?? "");
    const event = z.object({ type: z.string(), created_at: z.iso.datetime({ offset: true }), data: z.object({ email_id: z.string().max(200) }) }).parse(JSON.parse(raw));
    if (["email.delivered", "email.bounced", "email.complained", "email.suppressed"].includes(event.type)) await adsWorker("event", null, null, { eventId, providerId: event.data.email_id, status: event.type.slice(6), at: event.created_at });
    return Response.json({ received: true });
  } catch { return Response.json({ error: "Webhook not accepted." }, { status: 400 }); }
}
