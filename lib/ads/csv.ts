import { adsSnapshotSchema, type AdRow, type AdsSnapshot } from "./contract";
/** RFC4180-style parsing; never execute spreadsheet formulas or accept ambiguous numeric formats. */
export function parseCsv(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error("Choose an export under 2 MB.");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else if (quoted || !cell) quoted = !quoted; else throw new Error("Invalid CSV quotation."); }
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("The CSV ends inside a quoted value.");
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  if (rows.length > 10001) throw new Error("Export at most 10,000 daily ad rows."); return rows;
}
export function importAdsCsv(text: string, since: string, until: string, timezone: string, currency: string, accountName: string): AdsSnapshot {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || Date.parse(until) - Date.parse(since) !== 13 * 86400000) throw new Error("Choose exactly 14 complete days.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  if (until >= today) throw new Error("The export must end before today in the account timezone.");
  const csv = parseCsv(text.replace(/^\uFEFF/, "")); if (csv.length < 2) throw new Error("The CSV has no ad rows.");
  const headers = csv[0].map(h => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column headers.");
  const column = (...names: string[]) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
  const indexes = { date: column("day", "date", "date_start", "reporting starts"), end: column("date_stop", "reporting ends"), ad: column("ad id", "ad_id"), adName: column("ad name", "ad_name"), campaign: column("campaign id", "campaign_id"), campaignName: column("campaign name", "campaign_name"), spend: column(`amount spent (${currency.toLowerCase()})`, "spend"), impressions: column("impressions"), clicks: column("link clicks", "inline_link_clicks"), objective: column("objective") };
  if (Object.entries(indexes).some(([key, value]) => !["end", "objective"].includes(key) && value < 0)) throw new Error("Export daily rows with Ad ID, Ad name, Campaign ID, Campaign name, Amount spent, Impressions and Link clicks. Choose the matching currency.");
  const numeric = (value: string, optional = false) => { if (optional && (!value || value === "—" || value === "-")) return 0; const clean = value.trim(); if (!/^\d+(?:\.\d+)?$/.test(clean)) throw new Error("Use an English-locale CSV with unformatted numeric columns (no currency symbols or thousands separators)."); return Number(clean); };
  const rows: AdRow[] = csv.slice(1).map(row => {
    if (row.length !== headers.length) throw new Error("A CSV row has the wrong number of columns.");
    const date = row[indexes.date].trim(); if (date < since || date > until || (indexes.end >= 0 && row[indexes.end].trim() !== date)) throw new Error("Use daily ad rows within the selected dates; summary totals cannot be compared as daily data.");
    return { date, adId: row[indexes.ad].trim(), adName: row[indexes.adName], campaignId: row[indexes.campaign].trim(), campaignName: row[indexes.campaignName], objective: indexes.objective >= 0 ? row[indexes.objective] : "Unknown", spend: numeric(row[indexes.spend]), impressions: numeric(row[indexes.impressions]), linkClicks: numeric(row[indexes.clicks], true), purchases: null, purchaseValue: null };
  });
  if (new Set(rows.map(r => `${r.date}:${r.adId}`)).size !== rows.length) throw new Error("Duplicate ad/day rows found. Export without placement or demographic breakdowns.");
  return adsSnapshotSchema.parse({ data_origin: "manual_snapshot", account: { id: "act_0", name: accountName, currency, timezone_name: timezone }, since, until, fetchedAt: new Date().toISOString(), rows, creatives: [], attribution: "not_verified", warning: "Manually uploaded Ads Manager export. Not a live connection. Purchase tracking and attribution settings were not imported; compare click metrics only." });
}
