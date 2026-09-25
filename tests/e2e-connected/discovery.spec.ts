import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { DiscoveryView } from "../../lib/discovery/contract";
import { fixture } from "./fixture-data";

// All reports and observations in this suite are synthetic loopback test data.
// No real website crawl, Google authorization, Amazon lookup, or model call occurs.
test.use({ reducedMotion: "reduce" });
async function signIn(page: Page, email: string = fixture.memberEmail) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
async function tab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Discovery views", exact: true }).getByRole("button", { name, exact: true }).click();
}
async function savedView(page: Page): Promise<DiscoveryView> {
  return page.evaluate(async () => {
    const response = await fetch("/api/discovery");
    if (!response.ok) throw new Error("Fixture discovery read failed");
    return response.json();
  });
}
async function addWebsite(page: Page) {
  await tab(page, "Your website");
  await page.locator("#main-content").getByLabel("Page name", { exact: true }).fill("Synthetic author page");
  await page.locator("#main-content").getByLabel("Public page address", { exact: true }).fill("https://www.example.com/fixture-books");
  await page.locator("#main-content").getByRole("combobox", { name: "Related book", exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save website page", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic author page", exact: true })).toBeVisible();
}
async function addListing(page: Page) {
  await tab(page, "Amazon listings");
  await page.locator("#main-content").getByRole("combobox", { name: "Listing book", exact: true }).selectOption({ index: 1 });
  await page.locator("#main-content").getByLabel("Amazon book link", { exact: true }).fill("https://www.amazon.com/dp/B0TEST1234?tag=fixture-tracking");
  await page.locator("#main-content").getByLabel("Edition or format", { exact: true }).fill("Synthetic Kindle edition");
  await page.locator("#main-content").getByRole("textbox", { name: "Current or proposed listing description", exact: true }).fill("Synthetic public description supplied for the browser test.");
  await page.getByRole("button", { name: "Save listing review", exact: true }).click();
  await expect(page.locator("#main-content").getByText("Listing notes saved. Apply any accepted changes yourself in KDP.", { exact: true })).toBeVisible();
}
async function importCsv(page: Page, name: string, csv: string) {
  await tab(page, "Google search");
  const disclosure = page.locator("#main-content .discovery-import");
  if ((await disclosure.getAttribute("open")) === null) await disclosure.getByText("Bring a Search Console CSV export", { exact: true }).click();
  await page.locator("#main-content").getByLabel("Search Console CSV", { exact: true }).setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator("#main-content").getByLabel("Property on the export", { exact: true }).fill("https://www.example.com/ · synthetic browser export");
  await page.locator("#main-content").getByLabel("Report start", { exact: true }).fill("2026-01-01");
  await page.locator("#main-content").getByLabel("Report end", { exact: true }).fill("2026-01-03");
  await page.getByRole("button", { name: "Import search report", exact: true }).click();
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await signIn(page);
  await page.goto("/discoverability");
  await expect(page.getByRole("heading", { name: "Find your readers", exact: true })).toBeVisible();
});

test("disconnected discovery is useful without inventing analytics or working Google access", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Give your books a place to be found.", exact: true })).toBeVisible();
  await tab(page, "Google search");
  await expect(page.getByRole("button", { name: "Refresh Google report", exact: true })).toBeDisabled();
  await expect(page.locator("#main-content").getByText("Nothing is shown as zero just because access is missing.", { exact: false })).toBeVisible();
  await expect(page.locator("#main-content .discovery-metrics")).toHaveCount(0);
  await page.getByRole("button", { name: "Set up Google reporting", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Google Search Console", exact: true })).toBeDisabled();
  await expect(page.locator("#main-content").getByText(/Google application setup is pending/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Ads & Next Steps", exact: true })).toHaveAttribute("href", "/ads");
  await expect(page.locator("#main-content").getByText(/GA4 conversion reporting.*not active in this release/)).toBeVisible();
});

test("website mappings survive reload and duplicate failure keeps the author's input", async ({ page }) => {
  await addWebsite(page);
  await expect(page.locator("#main-content").getByLabel("Page name", { exact: true })).toHaveValue("");
  await page.reload();
  await tab(page, "Your website");
  const record = page.locator("#main-content .discovery-page-record");
  await expect(record).toContainText("NOT CHECKED YET");
  await expect(record.getByRole("button", { name: "Check this page", exact: true })).toBeEnabled();
  await page.locator("#main-content").getByRole("combobox", { name: "Book focus", exact: true }).selectOption({ index: 1 });
  await expect(record).toHaveCount(1);
  await page.locator("#main-content").getByRole("combobox", { name: "Book focus", exact: true }).selectOption({ index: 2 });
  await expect(record).toHaveCount(0);
  await page.locator("#main-content").getByRole("combobox", { name: "Book focus", exact: true }).selectOption("");
  await page.locator("#main-content").getByLabel("Page name", { exact: true }).fill("Preserve my duplicate correction");
  await page.locator("#main-content").getByLabel("Public page address", { exact: true }).fill("https://www.example.com/fixture-books");
  await page.getByRole("button", { name: "Save website page", exact: true }).click();
  await expect(page.locator("#main-content").getByText("That page is already saved.", { exact: true })).toBeVisible();
  await expect(page.locator("#main-content").getByLabel("Page name", { exact: true })).toHaveValue("Preserve my duplicate correction");
  expect((await savedView(page)).pages).toHaveLength(1);
});

test("Amazon edition notes create, reset, edit and reload without implying publishing", async ({ page }) => {
  await addListing(page);
  await expect(page.locator("#main-content").getByLabel("Edition or format", { exact: true })).toHaveValue("");
  await expect(page.locator("#main-content").getByLabel("Amazon book link", { exact: true })).toHaveValue("");
  await expect(page.getByRole("link", { name: "Open this Amazon edition", exact: true })).toHaveAttribute("href", "https://www.amazon.com/dp/B0TEST1234");
  await page.getByRole("button", { name: "Edit listing notes", exact: true }).click();
  await expect(page.locator("#main-content").getByRole("combobox", { name: "Listing book", exact: true })).toBeDisabled();
  await expect(page.locator("#main-content").getByLabel("Amazon book link", { exact: true })).toHaveAttribute("readonly", "");
  await page.locator("#main-content").getByRole("textbox", { name: "Current or proposed listing description", exact: true }).fill("Revised synthetic listing notes for review.");
  await page.locator("#main-content").getByText("Seven keyword fields", { exact: true }).click();
  await page.locator("#main-content").getByRole("textbox", { name: "Keyword field 1", exact: true }).fill("synthetic reader phrase");
  await page.locator("#main-content").getByRole("textbox", { name: "Categories (one per line, up to three)", exact: true }).fill("Synthetic category for browser test");
  await page.locator("#main-content").getByRole("combobox", { name: "Review status", exact: true }).selectOption("reviewed");
  await page.getByRole("button", { name: "Save listing review", exact: true }).click();
  await expect(page.locator("#main-content").getByText("MANUAL NOTES · AUTHOR REVIEWED", { exact: true })).toBeVisible();
  await page.reload();
  await tab(page, "Amazon listings");
  await page.getByRole("button", { name: "Edit listing notes", exact: true }).click();
  await expect(page.locator("#main-content").getByRole("textbox", { name: "Current or proposed listing description", exact: true })).toHaveValue("Revised synthetic listing notes for review.");
  await page.locator("#main-content").getByText("Seven keyword fields", { exact: true }).click();
  await expect(page.locator("#main-content").getByRole("textbox", { name: "Keyword field 1", exact: true })).toHaveValue("synthetic reader phrase");
  expect((await savedView(page)).listings).toHaveLength(1);
});

test("a concurrent listing edit shows a conflict and preserves the unsaved replacement", async ({ page, request }) => {
  await addListing(page);
  await page.getByRole("button", { name: "Edit listing notes", exact: true }).click();
  const listing = (await savedView(page)).listings[0];
  expect((await request.post(`${fixture.supabaseUrl}/__test/discovery-listing-conflict`, { data: { id: listing.id } })).ok()).toBe(true);
  await page.locator("#main-content").getByRole("textbox", { name: "Current or proposed listing description", exact: true }).fill("My unsaved author correction must survive.");
  await page.getByRole("button", { name: "Save listing review", exact: true }).click();
  await expect(page.locator("#main-content").getByText("Someone updated this listing. Reload it before saving again.", { exact: true })).toBeVisible();
  await expect(page.locator("#main-content").getByRole("textbox", { name: "Current or proposed listing description", exact: true })).toHaveValue("My unsaved author correction must survive.");
  expect((await savedView(page)).listings[0].description).toBe("Synthetic edit saved by another member.");
});

test("CSV reports preserve measured dates, weighted totals and unknown missing rows", async ({ page }, testInfo) => {
  const csv = "Date,Clicks,Impressions,CTR,Position\n2026-01-01,10,100,10%,2\n2026-01-03,20,400,5%,7";
  await importCsv(page, "synthetic-dates.csv", csv);
  await expect(page.locator("#main-content").getByText("MANUAL EXPORT · NOT LIVE SYNCED", { exact: true })).toBeVisible();
  await expect(page.locator("#main-content .discovery-metrics")).toContainText("30");
  await expect(page.locator("#main-content .discovery-metrics")).toContainText("500");
  await expect(page.locator("#main-content .discovery-metrics")).toContainText("6.0%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "A populated search report keeps its chart and table within the phone viewport").toBe(true);
  const reportRows = page.getByRole("region", { name: "Search report rows", exact: true });
  await reportRows.focus();
  await expect(reportRows).toBeFocused();
  if ((page.viewportSize()?.width ?? 1440) < 580) {
    await reportRows.press("ArrowRight");
    await expect.poll(() => reportRows.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await reportRows.evaluate(element => { element.scrollLeft = 0; });
  }
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("discovery-search-report.png"), fullPage: true });
  await expect(page.getByRole("table")).toContainText("missing rows remain unknown");
  await expect(page.getByRole("rowheader", { name: "2026-01-02", exact: true })).toHaveCount(0);
  const saved = await savedView(page);
  expect(saved.reports[0].snapshot.totals?.position).toBe(6);
  await page.reload();
  await tab(page, "Google search");
  await expect(page.getByRole("rowheader", { name: "2026-01-03", exact: true })).toBeVisible();
  await importCsv(page, "synthetic-dates.csv", csv);
  await expect(page.getByRole("button", { name: "Import search report", exact: true })).toBeEnabled();
  expect((await savedView(page)).reports).toHaveLength(1);
  await importCsv(page, "synthetic-queries.csv", "Top queries,Clicks,Impressions,CTR,Position\nsynthetic reader query,4,80,5%,3");
  await expect(page.getByRole("rowheader", { name: "synthetic reader query", exact: true })).toBeVisible();
  await expect(page.locator("#main-content .discovery-metrics")).toHaveCount(0);
  await expect(page.locator("#main-content").getByText(/Page and query exports cannot be combined/)).toBeVisible();
  await importCsv(page, "synthetic-invalid.csv", "Date,Clicks,Impressions,CTR,Position\n2026-01-02,81,80,101%,3");
  await expect(page.locator("#main-content").getByText("Check the exported labels, clicks and impressions.", { exact: true })).toBeVisible();
  await expect(page.locator("#main-content").getByLabel("Property on the export", { exact: true })).toHaveValue("https://www.example.com/ · synthetic browser export");
  expect((await savedView(page)).reports).toHaveLength(2);
});

test("a website finding becomes a sourced next step and an attributed Desk note", async ({ page, request }) => {
  await addWebsite(page);
  const saved = (await savedView(page)).pages[0];
  expect((await request.post(`${fixture.supabaseUrl}/__test/discovery-audit`, { data: { pageId: saved.id, audit: {
    url: saved.url, checkedAt: "2026-01-03T16:00:00.000Z", title: "Synthetic browser page", description: null, canonical: saved.url,
    h1: ["Synthetic page heading"], statusCode: 200, findings: [{ code: "description_missing", title: "Synthetic missing description", detail: "The synthetic HTML has no description element.", suggestion: "Review an approved public description before adding it to the page." }],
  } } })).ok()).toBe(true);
  await page.reload();
  await tab(page, "Your website");
  await page.getByRole("button", { name: "Save next step", exact: true }).click();
  await expect(page.locator("#main-content").getByText("Saved in your private workspace.", { exact: true })).toBeVisible();
  await tab(page, "Your next move");
  const action = page.locator("#main-content .discovery-row").filter({ has: page.getByRole("heading", { name: "Synthetic missing description", exact: true }) });
  await action.getByText("Review the plan and evidence", { exact: true }).click();
  await expect(action).toContainText(saved.url);
  await expect(action).toContainText("2026-01-03T16:00:00.000Z");
  await expect(action).toContainText("not Google's indexed page or a ranking diagnosis");
  await action.getByRole("button", { name: "I applied this change", exact: true }).click();
  await expect(action).toContainText("RECORDED AS APPLIED");
  await action.getByRole("button", { name: "Copy to my Desk", exact: true }).click();
  await expect(page.locator("#main-content").getByText("Saved to your Desk for review. Nothing was published.", { exact: true })).toBeVisible();
  await tab(page, "Your website");
  await page.locator("#main-content").getByText("Remove this page from KIRA", { exact: true }).click();
  await page.getByRole("button", { name: "Remove saved page", exact: true }).click();
  await expect(page.locator("#main-content .discovery-page-record")).toHaveCount(0);
  const afterRemoval = await savedView(page);
  expect(afterRemoval.actions).toHaveLength(1);
  expect(afterRemoval.actions[0].detail).toContain(saved.url);
  await page.goto("/desk");
  const brief = page.locator(".approval-card").filter({ has: page.getByRole("heading", { name: "Discovery · Synthetic missing description", exact: true }) });
  await expect(brief).toContainText(saved.url);
  await expect(brief).toContainText("No website or listing changes have been published.");
});

test("viewers can read saved work while writes and Google authorization stay unavailable", async ({ page, browser }) => {
  await addWebsite(page);
  expect(await page.evaluate(async email => (await fetch("/api/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", email, role: "viewer" }) })).status, fixture.outsiderEmail)).toBe(200);
  const context = await browser.newContext({ baseURL: fixture.appUrl });
  const viewer = await context.newPage();
  try {
    await signIn(viewer, fixture.outsiderEmail);
    await viewer.goto("/discoverability");
    await expect(viewer.locator("#main-content").getByText("You can read this workspace. An owner or editor can save changes and connect accounts.", { exact: true })).toBeVisible();
    await tab(viewer, "Your website");
    await expect(viewer.getByRole("heading", { name: "Synthetic author page", exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Save website page", exact: true })).toBeDisabled();
    await expect(viewer.getByRole("button", { name: "Check this page", exact: true })).toBeDisabled();
    expect(await viewer.evaluate(async () => (await fetch("/api/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "page", url: "https://example.com/unauthorized", label: "Unauthorized synthetic page", kind: "website", bookId: null }) })).status)).toBe(403);
    await tab(viewer, "Amazon listings");
    await expect(viewer.getByRole("button", { name: "Save listing review", exact: true })).toBeDisabled();
    await tab(viewer, "Connections");
    await expect(viewer.getByRole("button", { name: "Connect Google Search Console", exact: true })).toBeDisabled();
  } finally { await context.close(); }
});

test("all discovery views fit the viewport and expose accessible controls", async ({ page }, testInfo) => {
  for (const name of ["Your next move", "Your website", "Google search", "Amazon listings", "Connections"]) {
    await tab(page, name);
    if (name === "Google search") await page.locator("#main-content").getByText("Bring a Search Console CSV export", { exact: true }).click();
    if (name === "Amazon listings") await page.locator("#main-content").getByText("Seven keyword fields", { exact: true }).click();
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations, name).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), name).toBe(true);
  }
  await tab(page, "Your next move");
  await page.screenshot({ path: testInfo.outputPath("discovery-overview.png"), fullPage: true });
});
