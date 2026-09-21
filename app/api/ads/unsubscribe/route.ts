import { validUnsubscribe } from "@/lib/ads/delivery";
import { adsWorker } from "@/lib/ads/repository";
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'" };
function args(request: Request) { const p = new URL(request.url).searchParams; return { a: p.get("a") ?? "", u: p.get("u") ?? "", t: p.get("t") ?? "" }; }
export async function GET(request: Request) {
  const { a, u, t } = args(request);
  if (!validUnsubscribe(a, u, t)) return new Response("Invalid email preference link.", { status: 400 });
  return new Response('<!doctype html><html lang="en"><title>KIRA email preferences</title><h1>Stop your ad reports?</h1><p>This stops Monday and Thursday emails. Your KIRA workspace stays available.</p><form method="post"><button>Stop ad report emails</button></form></html>', { headers });
}
export async function POST(request: Request) {
  try { const { a, u, t } = args(request); if (!validUnsubscribe(a, u, t)) return new Response("Invalid link", { status: 400 }); await adsWorker("unsubscribe", u, null, { authorId: a }); return new Response('<!doctype html><html lang="en"><title>KIRA email preferences</title><h1>Your ad report emails are stopped.</h1><p>You can turn them back on in Ads & Next Steps.</p></html>', { headers }); }
  catch { return new Response("Could not save your preference. Please try again.", { status: 503 }); }
}
