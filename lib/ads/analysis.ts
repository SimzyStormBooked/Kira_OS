import type { AdRow, AdsSnapshot } from "./contract";
export function dateRange(now: Date, timezone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const shift = (days: number) => new Date(Date.parse(today + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
  return { since: shift(-14), until: shift(-1), split: shift(-7) };
}
export function totals(rows: AdRow[]) {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0), clicks = rows.reduce((sum, row) => sum + row.linkClicks, 0), impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const purchases = rows.some(row => row.purchases !== null) ? rows.reduce((sum, row) => sum + (row.purchases ?? 0), 0) : null;
  const revenue = rows.some(row => row.purchaseValue !== null) ? rows.reduce((sum, row) => sum + (row.purchaseValue ?? 0), 0) : null;
  return { spend, clicks, impressions, cpc: clicks ? spend / clicks : null, ctr: impressions ? clicks / impressions * 100 : null, purchases, revenue, roas: revenue !== null && spend > 0 ? revenue / spend : null };
}
export function analyzeAds(snapshot: AdsSnapshot) {
  const split = new Date(Date.parse(snapshot.until + "T12:00:00Z") - 6 * 86400000).toISOString().slice(0, 10);
  const current = snapshot.rows.filter(row => row.date >= split), previous = snapshot.rows.filter(row => row.date < split);
  const campaignIds = [...new Set(snapshot.rows.map(row => row.campaignId))];
  const campaigns = campaignIds.map(id => {
    const all = snapshot.rows.filter(row => row.campaignId === id), recent = totals(current.filter(row => row.campaignId === id)), prior = totals(previous.filter(row => row.campaignId === id));
    const sufficient = recent.clicks >= 50 && prior.clicks >= 50 && recent.impressions >= 1000 && prior.impressions >= 1000;
    const change = recent.cpc !== null && prior.cpc !== null && prior.cpc > 0 ? (recent.cpc / prior.cpc - 1) * 100 : null;
    const status = !sufficient ? "More data needed" : change !== null && change >= 20 ? "Review click costs" : change !== null && change <= -20 ? "Lower click costs" : "Costs broadly steady";
    return { id, name: all[0].campaignName, objective: all[0].objective, recent, prior, change, status,
      explanation: !sufficient ? "At least 50 link clicks and 1,000 impressions in each window are needed for this directional comparison. This is a screening rule, not statistical significance." : "This compares cost per link click, not overall campaign success or causation. Check your objective, delivery changes and conversion lag before acting.",
      nextStep: !sufficient ? "Check tracking and let the campaign collect more evidence before declaring a winner." : change !== null && change >= 20 ? "Inspect which ads and placements changed. If the evidence points to creative fatigue, test one new cover crop or approved hook while keeping the audience steady." : "Review the ads contributing the lowest click costs against your actual sales or lead goal. Record one controlled test instead of changing everything at once." };
  }).sort((a, b) => b.recent.spend - a.recent.spend);
  return { current: totals(current), previous: totals(previous), split, campaigns, daily: Array.from({ length: 14 }, (_, index) => { const date = new Date(Date.parse(snapshot.since + "T12:00:00Z") + index * 86400000).toISOString().slice(0, 10); return { date, ...totals(snapshot.rows.filter(row => row.date === date)) }; }) };
}
export const money = (amount: number | null, currency: string) => amount === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
