import { adsSnapshotSchema, type AdRow, type AdsSnapshot } from "./contract";

export type AdsCsvInspection = {
  since: string | null;
  until: string | null;
  currency: string | null;
  rowCount: number;
  adCount: number;
  campaignCount: number;
  observedDayCount: number;
  warnings: string[];
  issues: string[];
};

const DAY_MS = 86_400_000;

/** RFC4180-style parsing; never execute spreadsheet formulas or accept ambiguous numeric formats. */
export function parseCsv(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error("Choose an export under 2 MB.");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, afterQuote = false;
  const finishCell = () => { row.push(cell); cell = ""; afterQuote = false; };
  const finishRow = () => {
    finishCell();
    if (row.some(value => value.trim() !== "")) rows.push(row);
    if (rows.length > 10001) throw new Error("Export at most 10,000 daily ad rows.");
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else cell += char;
    } else if (char === ",") finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else if (afterQuote) {
      if (char !== " " && char !== "\t") throw new Error("Invalid CSV quotation. Export the file again as a CSV.");
    } else if (char === '"') {
      if (cell.trim()) throw new Error("Invalid CSV quotation. Export the file again as a CSV.");
      cell = ""; quoted = true;
    } else cell += char;
  }
  if (quoted) throw new Error("The CSV ends inside a quoted value. Export the file again as a CSV.");
  finishRow();
  return rows;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && adsSnapshotSchema.shape.since.safeParse(value).success;
}

function numeric(value: string, name: string, optional = false): number {
  const clean = value.trim();
  if (optional && (!clean || clean === "—" || clean === "-")) return 0;
  if (!/^\d+(?:\.\d+)?$/.test(clean) || !Number.isFinite(Number(clean))) {
    throw new Error(`${name} must use plain nonnegative numbers. Export an English-locale CSV without currency symbols or thousands separators.`);
  }
  const number = Number(clean);
  if (name !== "Amount spent" && !Number.isSafeInteger(number)) throw new Error(`${name} must contain whole-number counts.`);
  return number;
}

function inspectTable(text: string): { inspection: AdsCsvInspection; rows: AdRow[] } {
  const inspection: AdsCsvInspection = { since: null, until: null, currency: null, rowCount: 0, adCount: 0, campaignCount: 0, observedDayCount: 0, warnings: [], issues: [] };
  const rows: AdRow[] = [];
  const issue = (message: string) => { if (!inspection.issues.includes(message) && inspection.issues.length < 8) inspection.issues.push(message); };
  let csv: string[][];
  try { csv = parseCsv(text); }
  catch (error) { issue(error instanceof Error ? error.message : "Choose a valid Ads Manager CSV export."); return { inspection, rows }; }
  if (csv.length < 2) { issue("The CSV has no ad rows. Choose an Ads Manager CSV export."); return { inspection, rows }; }
  inspection.rowCount = csv.length - 1;
  const headers = csv[0].map(header => header.trim().toLowerCase().replace(/\s+/g, " "));
  if (headers.length === 1) issue("Choose a comma-separated CSV exported from Ads Manager, using the English locale.");
  if (new Set(headers).size !== headers.length) issue("The CSV contains duplicate column headers. Export each column once.");
  if (headers.some(header => /time of day|hourly_stats_aggregated|^hour(?:ly)?$/.test(header))) {
    issue("Remove the Time of day breakdown and export one row per ad per day.");
  }
  if (headers.some(header => ["week", "month", "year"].includes(header))) issue("Remove weekly, monthly or yearly breakdowns and export one row per ad per day.");
  const breakdowns = new Set(["age", "gender", "age and gender", "country", "region", "dma", "placement", "placements", "platform", "publisher platform", "publisher_platform", "platform position", "platform_position", "impression device", "impression_device", "device", "device platform", "device_platform", "conversion device", "product id", "product_id"]);
  if (headers.some(header => breakdowns.has(header))) issue("Remove placement, device and demographic breakdowns and export one row per ad per day.");
  const column = (...names: string[]) => names.map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1;
  const spendHeaders = headers.map((header, index) => ({ index, match: /^amount spent\s*\(\s*([a-z]{3})\s*\)$/.exec(header) })).filter(value => value.match);
  if (spendHeaders.length > 1 || (spendHeaders.length > 0 && column("spend") >= 0)) issue("Keep one Amount spent column in the account currency; multiple spend columns are ambiguous.");
  if (spendHeaders.length === 1) inspection.currency = spendHeaders[0].match![1].toUpperCase();
  const indexes = {
    date: column("day", "date", "date_start", "reporting starts"),
    end: column("date_stop", "reporting ends"),
    ad: column("ad id", "ad_id"), adName: column("ad name", "ad_name"),
    campaign: column("campaign id", "campaign_id"), campaignName: column("campaign name", "campaign_name"),
    spend: spendHeaders[0]?.index ?? column("spend"),
    impressions: column("impressions"), clicks: column("link clicks", "inline_link_clicks"), objective: column("objective"),
  };
  if (indexes.clicks < 0) issue("Add an explicit Link clicks column in Ads Manager. Results can mix different metrics and cannot be used as Link clicks.");
  const required = { date: "Day", ad: "Ad ID", adName: "Ad name", campaign: "Campaign ID", campaignName: "Campaign name", spend: "Amount spent (account currency)", impressions: "Impressions" } as const;
  const missing = Object.entries(required).filter(([key]) => indexes[key as keyof typeof required] < 0).map(([, label]) => label);
  if (missing.length) issue(`Add these columns to the daily ad-level export: ${missing.join(", ")}.`);
  if (!inspection.currency && indexes.spend >= 0) inspection.warnings.push("The file does not identify its currency. Confirm the currency used by this ad account.");
  const ads = new Set<string>(), campaigns = new Set<string>(), dates = new Set<string>(), adDates = new Set<string>();
  let earliest: string | null = null, latest: string | null = null;
  for (const row of csv.slice(1)) {
    if (row.length !== headers.length) { issue("A CSV row has the wrong number of columns. Export the file again without editing its commas or quotes."); continue; }
    const value = (index: number) => index >= 0 ? row[index].trim() : "";
    const date = value(indexes.date), end = indexes.end >= 0 ? value(indexes.end) : date;
    if (isDate(date)) {
      dates.add(date);
      if (!earliest || date < earliest) earliest = date;
      if (!latest || date > latest) latest = date;
    } else if (indexes.date >= 0) issue("Use real calendar dates in YYYY-MM-DD format in every Day or Reporting starts row; remove summary totals.");
    if (isDate(end)) { if (!latest || end > latest) latest = end; }
    else if (indexes.end >= 0) issue("Use real calendar dates in YYYY-MM-DD format in every Reporting ends row.");
    if (indexes.end >= 0 && date !== end) issue("Use daily ad rows: Reporting starts and Reporting ends must be the same date on each row. Remove summary totals.");
    const adId = value(indexes.ad), campaignId = value(indexes.campaign);
    if (adId) ads.add(adId);
    if (campaignId) campaigns.add(campaignId);
    if (indexes.ad >= 0 && !/^\d{1,30}$/.test(adId)) issue("Ad ID must contain the original numeric ID. Export at ad level without summary totals or shortened IDs.");
    if (indexes.campaign >= 0 && !/^\d{1,30}$/.test(campaignId)) issue("Campaign ID must contain the original numeric ID. Remove summary totals or shortened IDs.");
    if (date && adId) {
      const key = `${date}:${adId}`;
      if (adDates.has(key)) issue("Duplicate ad/day rows found. Remove Time of day, placement and demographic breakdowns before exporting.");
      adDates.add(key);
    }
    if (Object.entries(indexes).some(([key, index]) => key !== "end" && key !== "objective" && index < 0)) continue;
    try {
      const adName = value(indexes.adName), campaignName = value(indexes.campaignName), objective = indexes.objective >= 0 ? value(indexes.objective) || "Unknown" : "Unknown";
      if (adName.length > 500 || campaignName.length > 500 || objective.length > 100) throw new Error("An ad name, campaign name or objective is too long. Choose an unedited Ads Manager export.");
      rows.push({ date, adId, adName, campaignId, campaignName, objective, spend: numeric(value(indexes.spend), "Amount spent"), impressions: numeric(value(indexes.impressions), "Impressions"), linkClicks: numeric(value(indexes.clicks), "Link clicks", true), purchases: null, purchaseValue: null });
    } catch (error) { issue(error instanceof Error ? error.message : "A row contains an invalid metric."); }
  }
  inspection.since = earliest;
  inspection.until = latest;
  inspection.adCount = ads.size;
  inspection.campaignCount = campaigns.size;
  inspection.observedDayCount = dates.size;
  if (dates.size > 0 && earliest && latest) {
    const rangeDays = Math.round((Date.parse(latest) - Date.parse(earliest)) / DAY_MS) + 1;
    if (rangeDays > dates.size || dates.size < 14) inspection.warnings.push(`The file has rows on ${dates.size} distinct ${dates.size === 1 ? "date" : "dates"}. Dates without rows are not verified as zero activity.`);
  }
  return { inspection, rows };
}

/** Pure, browser-safe file review. Account settings and today's date are validated only on import. */
export function inspectAdsCsv(text: string): AdsCsvInspection {
  return inspectTable(text).inspection;
}

export function importAdsCsv(text: string, since: string, until: string, timezone: string, currency: string, accountName: string): AdsSnapshot {
  since = since.trim(); until = until.trim(); timezone = timezone.trim(); currency = currency.trim().toUpperCase(); accountName = accountName.trim();
  if (!isDate(since) || !isDate(until) || Date.parse(until) - Date.parse(since) !== 13 * DAY_MS) throw new Error("Choose exactly 14 complete days using real calendar dates (YYYY-MM-DD).");
  let today: string;
  try {
    if (!timezone || timezone.length > 100) throw new Error("Invalid timezone");
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    today = ["year", "month", "day"].map(part => parts.find(value => value.type === part)?.value).join("-");
  } catch { throw new Error("Enter a valid account timezone, such as America/Phoenix. Use the timezone shown in Ads Manager."); }
  if (until >= today) throw new Error("The export must end before today in the account timezone.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter the account currency as a three-letter code, such as USD.");
  if (!accountName || accountName.length > 500) throw new Error("Enter an account label of 1–500 characters.");
  const { inspection, rows } = inspectTable(text);
  if (inspection.issues.length) throw new Error(inspection.issues.join(" "));
  if (inspection.currency && inspection.currency !== currency) throw new Error(`The file uses ${inspection.currency}, but the selected currency is ${currency}. Choose the account currency that matches the export.`);
  if (rows.some(row => row.date < since || row.date > until)) throw new Error("The file contains dates outside the selected 14-day range. Choose matching dates or export that range again.");
  const coverage = inspection.observedDayCount < 14 ? ` Rows are present on ${inspection.observedDayCount} of the 14 selected dates; dates without rows are not verified as zero activity.` : "";
  return adsSnapshotSchema.parse({ data_origin: "manual_snapshot", account: { id: "act_0", name: accountName, currency, timezone_name: timezone }, since, until, fetchedAt: new Date().toISOString(), rows, creatives: [], attribution: "not_verified", warning: `Manually uploaded Ads Manager export. Not a live connection. Purchase tracking and attribution settings were not imported; compare click metrics only.${coverage}` });
}
