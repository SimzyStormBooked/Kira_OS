import "server-only";
import { z } from "zod";
import { getMetaConfig } from "@/lib/connections/meta-config";
import { graph, MetaProviderError } from "@/lib/connections/meta-provider";
import { adsAccountSchema, adsSnapshotSchema, type AdsSnapshot } from "./contract";
import { dateRange } from "./analysis";
export function adsConfig() {
  const config = getMetaConfig({ ...process.env, KIRA_META_LOGIN_CONFIG_ID: process.env.KIRA_META_ADS_LOGIN_CONFIG_ID });
  return config ? { ...config, callbackUrl: `${config.origin}/api/ads/meta/callback` } : null;
}
type Config = NonNullable<ReturnType<typeof adsConfig>>;
const id = z.string().regex(/^\d{1,30}$/);
const pageSchema = z.object({ data: z.array(z.unknown()), paging: z.object({ next: z.string().optional(), cursors: z.object({ after: z.string().max(4000).optional() }).optional() }).optional() });
async function pages(config: Config, path: string, params: Record<string, string>, token: string, cap = 20) {
  const all: unknown[] = []; let after: string | undefined;
  for (let index = 0; index < cap; index++) {
    const page = pageSchema.parse(await graph(config, path, { ...params, limit: "500", ...(after ? { after } : {}) }, token));
    all.push(...page.data);
    if (!page.paging?.next) return all;
    after = page.paging.cursors?.after;
    if (!after) throw new MetaProviderError("provider_unavailable");
  }
  throw new MetaProviderError("provider_unavailable"); // Never label a truncated response as complete.
}
export async function exchangeAdsCode(config: Config, code: string) {
  const schema = z.object({ access_token: z.string().min(1).max(16000) });
  const short = schema.parse(await graph(config, "oauth/access_token", { client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.callbackUrl, code }));
  const long = schema.parse(await graph(config, "oauth/access_token", { client_id: config.appId, client_secret: config.appSecret, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token }));
  const debug = z.object({ data: z.object({ app_id: z.string(), user_id: id, type: z.literal("USER"), is_valid: z.literal(true), scopes: z.string().array(), expires_at: z.number(), data_access_expires_at: z.number().optional() }) }).parse(await graph(config, "debug_token", { input_token: long.access_token }, `${config.appId}|${config.appSecret}`)).data;
  if (debug.app_id !== config.appId || !debug.scopes.includes("ads_read")) throw new MetaProviderError("permissions");
  const deadlines = [debug.expires_at, debug.data_access_expires_at ?? 0].filter(value => value > 0);
  const expiry = Math.min(...deadlines) * 1000;
  if (!deadlines.length || expiry <= Date.now() + 60000) throw new MetaProviderError("reconnect");
  const accounts = adsAccountSchema.array().max(100).parse(await pages(config, "me/adaccounts", { fields: "id,name,currency,timezone_name" }, long.access_token, 1));
  if (!accounts.length) throw new MetaProviderError("no_accounts");
  return { token: long.access_token, metaUserId: debug.user_id, expiresAt: new Date(expiry).toISOString(), accounts };
}
const number = z.coerce.number().finite().nonnegative();
const actions = z.array(z.object({ action_type: z.string(), value: number })).default([]);
const insightSchema = z.object({ account_id: id, date_start: z.iso.date(), date_stop: z.iso.date(), ad_id: id, ad_name: z.string().max(500), campaign_id: id, campaign_name: z.string().max(500), objective: z.string().max(100).default("Unknown"), spend: number, impressions: number.int(), inline_link_clicks: number.int().default(0), actions, action_values: actions });
export async function fetchAds(config: Config, token: string, selected: string): Promise<AdsSnapshot> {
  if (!/^act_\d{1,30}$/.test(selected)) throw new MetaProviderError("permissions");
  const account = adsAccountSchema.parse(await graph(config, selected, { fields: "id,name,currency,timezone_name" }, token));
  if (account.id !== selected) throw new MetaProviderError("permissions");
  const range = dateRange(new Date(), account.timezone_name);
  const raw = await pages(config, `${selected}/insights`, { fields: "account_id,date_start,date_stop,ad_id,ad_name,campaign_id,campaign_name,objective,spend,impressions,inline_link_clicks,actions,action_values", level: "ad", time_increment: "1", time_range: JSON.stringify({ since: range.since, until: range.until }), action_attribution_windows: '["7d_click","1d_view"]', action_report_time: "impression" }, token);
  const rows = raw.map(value => {
    const r = insightSchema.parse(value);
    if (`act_${r.account_id}` !== selected || r.date_start !== r.date_stop || r.date_start < range.since || r.date_start > range.until) throw new MetaProviderError("provider_unavailable");
    return { date: r.date_start, adId: r.ad_id, adName: r.ad_name, campaignId: r.campaign_id, campaignName: r.campaign_name, objective: r.objective, spend: r.spend, impressions: r.impressions, linkClicks: r.inline_link_clicks, purchases: r.actions.find(a => a.action_type === "purchase")?.value ?? null, purchaseValue: r.action_values.find(a => a.action_type === "purchase")?.value ?? null };
  });
  if (new Set(rows.map(r => `${r.date}:${r.adId}`)).size !== rows.length) throw new MetaProviderError("provider_unavailable");
  let warning: string | null = null; const creatives: AdsSnapshot["creatives"] = [];
  try {
    const ads = await pages(config, `${selected}/ads`, { fields: "id,effective_status,creative{title,body,thumbnail_url}" }, token, 4);
    const activeIds = new Set(rows.map(r => r.adId));
    for (const value of ads) {
      const ad = z.object({ id, effective_status: z.string(), creative: z.object({ title: z.string().default(""), body: z.string().default(""), thumbnail_url: z.string().optional() }).optional() }).parse(value);
      if (!activeIds.has(ad.id)) continue;
      let thumbnail: string | null = null;
      if (ad.creative?.thumbnail_url) { const url = new URL(ad.creative.thumbnail_url); if (url.protocol === "https:" && /(^|\.)(fbcdn\.net|facebook\.com)$/.test(url.hostname)) thumbnail = url.href; }
      creatives.push({ adId: ad.id, title: ad.creative?.title ?? "", body: ad.creative?.body ?? "", thumbnail, status: ad.effective_status });
    }
  } catch { warning = "Metrics are complete; some creative previews could not be loaded."; }
  return adsSnapshotSchema.parse({ data_origin: "meta_api", account, since: range.since, until: range.until, fetchedAt: new Date().toISOString(), rows, creatives, attribution: "7d_click,1d_view", warning });
}
