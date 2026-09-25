import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectAdsCsv, importAdsCsv, parseCsv } from "@/lib/ads/csv";

const header = "Day,Ad ID,Ad name,Campaign ID,Campaign name,Amount spent (USD),Impressions,Link clicks";
const row = '2026-09-07,123,"Cover, variation A",456,Launch,12.5,1000,20';
const endRow = "2026-09-20,123,Cover B,456,Launch,10,900,19";
const csv = `${header}\n${row}\n${endRow}`;
const importFile = (text: string) => importAdsCsv(text, "2026-09-07", "2026-09-20", "America/Phoenix", "USD", "My account");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("manual Meta exports", () => {
  it("parses quoted cells and creates an explicitly manual snapshot with coverage provenance", () => {
    const snapshot = importFile(`${header}\r\n${row}`);
    expect(snapshot.data_origin).toBe("manual_snapshot");
    expect(snapshot.attribution).toBe("not_verified");
    expect(snapshot.rows[0].adName).toBe("Cover, variation A");
    expect(snapshot.rows[0].purchases).toBeNull();
    expect(snapshot.warning).toContain("1 of the 14 selected dates");
    expect(snapshot.warning).toContain("not verified as zero activity");
  });

  it("inspects every row for dates, unique ads and campaigns without relying on file order", () => {
    const result = inspectAdsCsv(`${header}\n${endRow}\n2026-09-12,999,Second ad,888,Second campaign,8,800,8\n${row}\n2026-09-10,123,Cover A,456,Launch,3,300,3`);
    expect(result).toMatchObject({ since: "2026-09-07", until: "2026-09-20", currency: "USD", rowCount: 4, adCount: 2, campaignCount: 2, observedDayCount: 4, issues: [] });
    expect(result.warnings.join(" ")).toContain("4 distinct dates");
  });

  it("keeps inferred dates and settings unknown when absent rather than inventing a range", () => {
    const result = inspectAdsCsv("Ad ID,Campaign ID,spend\n123,456,12.5");
    expect(result).toMatchObject({ since: null, until: null, currency: null, rowCount: 1, adCount: 1, campaignCount: 1, observedDayCount: 0 });
    expect(result.issues.join(" ")).toContain("Day");
    expect(result.warnings.join(" ")).toContain("does not identify its currency");
  });

  it("reports all fourteen observed dates only when they are present", () => {
    const dailyRows = Array.from({ length: 14 }, (_, index) => `2026-09-${String(index + 7).padStart(2, "0")},123,Cover,456,Launch,1,100,2`);
    const text = `${header}\n${dailyRows.join("\n")}`;
    expect(inspectAdsCsv(text)).toMatchObject({ observedDayCount: 14, warnings: [], issues: [] });
    expect(importFile(text).warning).not.toContain("dates without rows");
  });

  it("accepts BOM, CRLF, trimmed headers and numeric whitespace including missing click markers", () => {
    const text = `\uFEFF Day , Ad ID , Ad name , Campaign ID , Campaign name , Amount spent ( usd ) , Impressions , Link clicks \r\n 2026-09-07 , 123 , Ad A , 456 , Launch , 12.5 , 1000 , — \r\n   \r\n`;
    const snapshot = importAdsCsv(text, " 2026-09-07 ", " 2026-09-20 ", " America/Phoenix ", " usd ", " My account ");
    expect(snapshot.rows[0]).toMatchObject({ adId: "123", adName: "Ad A", campaignName: "Launch", spend: 12.5, impressions: 1000, linkClicks: 0 });
    expect(snapshot.account).toMatchObject({ name: "My account", currency: "USD", timezone_name: "America/Phoenix" });
    expect(inspectAdsCsv(text).rowCount).toBe(1);
  });

  it.each(["Time of day (ad account time zone)", "Time of day (viewer’s time zone)", "hourly_stats_aggregated_by_advertiser_time_zone", "hourly_stats_aggregated_by_audience_time_zone"])("rejects the %s breakdown even when no duplicate ad/day rows occur", breakdown => {
    const text = `${header},${breakdown}\n${row},01:00:00 - 01:59:59`;
    expect(inspectAdsCsv(text).issues).toContain("Remove the Time of day breakdown and export one row per ad per day.");
    expect(() => importFile(text)).toThrow(/Time of day/);
  });

  it.each(["Placement", "Age", "Gender", "Country", "Publisher platform", "Impression device", "Device platform"])("rejects a %s breakdown without relying on duplicate rows", breakdown => {
    const text = `${header},${breakdown}\n${row},Feed`;
    expect(inspectAdsCsv(text).issues.join(" ")).toMatch(/Remove placement, device and demographic breakdowns/);
    expect(() => importFile(text)).toThrow(/breakdowns/);
  });

  it.each(["Week", "Month", "Year"])("rejects a %s reporting breakdown even with a Day column", breakdown => {
    expect(() => importFile(`${header},${breakdown}\n${row},2026`)).toThrow(/weekly, monthly or yearly breakdowns/);
  });

  it("reports hourly and mixed Results problems together without treating Results as Link clicks", () => {
    const text = `${header.replace("Link clicks", "Results")},Time of day (ad account time zone),Result type\n${row},01:00:00 - 01:59:59,Post engagements`;
    const issues = inspectAdsCsv(text).issues.join(" ");
    expect(issues).toContain("Remove the Time of day breakdown");
    expect(issues).toContain("Add an explicit Link clicks column");
    expect(issues).toContain("Results can mix different metrics");
    expect(() => importFile(text)).toThrow(/Link clicks/);
  });

  it("uses explicit Link clicks when an unrelated Results column is also present", () => {
    const text = `${header},Results,Result type\n${row},400,Post engagements`;
    expect(inspectAdsCsv(text).issues).toEqual([]);
    expect(importFile(text).rows[0].linkClicks).toBe(20);
  });

  it("rejects duplicate ad/day rows and an account currency mismatch", () => {
    expect(() => importFile(`${header}\n${row}\n${row}`)).toThrow(/Duplicate/);
    expect(() => importAdsCsv(csv, "2026-09-07", "2026-09-20", "America/Phoenix", "EUR", "Test")).toThrow(/file uses USD.*currency is EUR/);
  });

  it("rejects multiple spend currencies instead of silently choosing one", () => {
    const text = `${header},Amount spent (EUR)\n${row},11`;
    expect(inspectAdsCsv(text).currency).toBeNull();
    expect(() => importFile(text)).toThrow(/multiple spend columns are ambiguous/);
  });

  it("supports explicit API-style column names but asks for currency confirmation", () => {
    const text = "date_start,date_stop,ad_id,ad_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks\n2026-09-07,2026-09-07,123,Cover,456,Launch,12.5,1000,20";
    expect(inspectAdsCsv(text)).toMatchObject({ since: "2026-09-07", until: "2026-09-07", currency: null, issues: [] });
    expect(importFile(text).rows[0].linkClicks).toBe(20);
  });

  it("infers the complete file span but rejects summary reporting windows", () => {
    const text = `${header.replace("Day", "Reporting starts")},Reporting ends\n${row},2026-09-20`;
    expect(inspectAdsCsv(text)).toMatchObject({ since: "2026-09-07", until: "2026-09-20", observedDayCount: 1 });
    expect(() => importFile(text)).toThrow(/Reporting starts and Reporting ends must be the same date/);
  });

  it.each(["2026-02-29", "2026-09-31", "2026-09-07T00:00:00Z", "09/07/2026"])("rejects invalid or non-ISO row date %s", date => {
    const text = `${header}\n${row.replace("2026-09-07", date)}`;
    expect(inspectAdsCsv(text).issues.join(" ")).toContain("real calendar dates");
    expect(() => importFile(text)).toThrow(/real calendar dates/);
  });

  it("rejects invalid selected dates even when Date.parse would normalize them to a fourteen-day interval", () => {
    expect(() => importAdsCsv(csv, "2026-02-30", "2026-03-15", "America/Phoenix", "USD", "Test")).toThrow(/real calendar dates/);
    expect(() => importAdsCsv(csv, "2026-09-07", "2026-09-09", "America/Phoenix", "USD", "Test")).toThrow(/14/);
  });

  it("rejects rows outside the selected range", () => {
    expect(() => importFile(`${header}\n${row.replace("2026-09-07", "2026-09-06")}`)).toThrow(/outside the selected 14-day range/);
  });

  it("validates the timezone with an actionable message and uses its calendar date", () => {
    expect(() => importAdsCsv(csv, "2026-09-07", "2026-09-20", "Arizona-ish", "USD", "Test")).toThrow(/valid account timezone/);
    vi.setSystemTime(new Date("2026-09-21T00:30:00Z"));
    expect(() => importFile(csv)).toThrow(/before today in the account timezone/);
    expect(() => importAdsCsv(csv, "2026-09-07", "2026-09-20", "UTC", "USD", "Test")).not.toThrow();
  });

  it.each([['"1,000"', "Impressions"], ["1.5", "Impressions"], ["9007199254740992", "Impressions"]])("rejects invalid or unsafe count %s", (count, metric) => {
    const text = `${header}\n${row.replace("1000", count)}`;
    expect(inspectAdsCsv(text).issues.join(" ")).toContain(metric);
    expect(() => importFile(text)).toThrow(/whole-number counts|plain nonnegative numbers/);
  });

  it("rejects scientific-notation IDs and duplicate or malformed columns before saving", () => {
    expect(() => importFile(`${header}\n${row.replace("123", "1.23E+17")}`)).toThrow(/original numeric ID/);
    expect(() => importFile(`${header},Ad ID\n${row},123`)).toThrow(/duplicate column headers/);
    expect(() => importFile(`${header}\n${row},extra`)).toThrow(/wrong number of columns/);
  });

  it("returns issues for empty, non-CSV, truncated and oversized inputs without throwing", () => {
    for (const text of ["", "<html>not a report</html>", 'a,b\n"unfinished', "x".repeat(2_000_001)]) {
      expect(() => inspectAdsCsv(text)).not.toThrow();
      expect(inspectAdsCsv(text).issues.length).toBeGreaterThan(0);
    }
    expect(inspectAdsCsv("Day;Ad ID\n2026-09-07;123").issues.join(" ")).toContain("comma-separated CSV");
  });
});

describe("CSV quoting", () => {
  it("preserves escaped quotes, embedded commas and multiline values", () => {
    expect(parseCsv('a,b\r\n"line one\nline two","A ""quoted"", name"')).toEqual([["a", "b"], ["line one\nline two", 'A "quoted", name']]);
  });

  it("rejects unexpected text following a closing quote and unfinished quoted values", () => {
    expect(() => parseCsv('a,b\n"name"oops,2')).toThrow(/Invalid CSV quotation/);
    expect(() => parseCsv('a,b\nna"me,2')).toThrow(/Invalid CSV quotation/);
    expect(() => parseCsv('a,b\n"unfinished')).toThrow(/ends inside a quoted value/);
  });

  it("ignores whitespace-only rows and enforces the data-row limit", () => {
    expect(parseCsv("a,b\n \t, \t\n1,2\n  ")).toEqual([["a", "b"], ["1", "2"]]);
    expect(() => parseCsv(`a,b\n${"1,2\n".repeat(10_001)}`)).toThrow(/10,000/);
  });
});
