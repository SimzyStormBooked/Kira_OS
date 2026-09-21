import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adsSnapshotSchema } from "./contract";
import { adsWorker, emailReady, recordingKey } from "./repository";
import { renderAdsEmail } from "./email";
import { parseApplicationOrigin } from "@/lib/config";
export function unsubscribeToken(author: string, user: string) { return createHmac("sha256", recordingKey()).update(`ads-unsubscribe-v1:${author}:${user}`).digest("hex"); }
export function validUnsubscribe(author: string, user: string, token: string) {
  if (!z.uuid().safeParse(author).success || !z.uuid().safeParse(user).success || !/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(unsubscribeToken(author, user)), Buffer.from(token));
}
export async function deliverAdReport(id: string) {
  if (!emailReady()) return "email_setup";
  const item = await adsWorker("email_claim", id);
  if (!item) return "skipped";
  try {
    const snapshot = adsSnapshotSchema.parse(item.snapshot);
    if (snapshot.data_origin !== "meta_api") throw new Error("Sample reports cannot be mailed automatically.");
    const origin = parseApplicationOrigin(process.env.NEXT_PUBLIC_APP_URL ?? ""); if (!origin) throw new Error("Origin unavailable");
    const unsubscribe = `${origin}/api/ads/unsubscribe?a=${item.authorId}&u=${item.userId}&t=${unsubscribeToken(item.authorId, item.userId)}`;
    const rendered = renderAdsEmail(snapshot, `${origin}/ads?report=${item.reportId}`, unsubscribe);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `kira-ads-${id}` }, body: JSON.stringify({ from: process.env.KIRA_ADS_EMAIL_FROM, to: [item.email], ...rendered, headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Email request failed");
    const result = z.object({ id: z.string().min(1).max(200) }).parse(await response.json());
    await adsWorker("email_finish", id, null, { providerId: result.id });
    return "accepted"; // Accepted is not delivered. Signed webhook confirms delivery later.
  } catch { await adsWorker("email_finish", id, null, {}).catch(() => {}); return "failed"; }
}
export function verifyEmailWebhook(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("svix-id"), timestamp = headers.get("svix-timestamp"), signatures = headers.get("svix-signature");
  if (!id || !timestamp || !/^\d+$/.test(timestamp) || !signatures || Math.abs(now / 1000 - Number(timestamp)) > 300 || !secret.startsWith("whsec_")) throw new Error("Invalid webhook");
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.${raw}`).digest();
  if (!signatures.split(" ").some(part => { const [version, value] = part.split(","); if (version !== "v1" || !value) return false; const actual = Buffer.from(value, "base64"); return actual.length === expected.length && timingSafeEqual(actual, expected); })) throw new Error("Invalid webhook");
  return id;
}
