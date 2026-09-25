import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AdsView } from "../../lib/ads/contract";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });
const pageErrors = new WeakMap<Page, string[]>();

function dailyCsv({ currency = "USD", since = "2026-01-01", until = "2026-01-14", spend = 12, campaign = "Fixture campaign" } = {}) {
  return [
    `Day,Ad ID,Ad name,Campaign ID,Campaign name,Amount spent (${currency}),Impressions,Link clicks`,
    `${since},123,Fixture creative,456,${campaign},10,1000,20`,
    `${until},123,Fixture creative,456,${campaign},${spend},1000,18`,
  ].join("\n");
}

async function selectCsv(page: Page, csv: string, name = "fixture.csv") {
  await page.getByLabel("CSV export", { exact: true }).setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(csv) });
}

async function openSetup(page: Page) {
  await page.locator(".ads-tabs").getByRole("button", { name: "Reports & setup", exact: true }).click();
}

async function navigate(page: Page, href: string) {
  await expect.poll(() => page.locator('[data-slot="sheet-content"]').count()).toBe(0);
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible() && await menu.getAttribute("aria-expanded") !== "true") await menu.click();
  await page.locator(`a.nav-item[href="${href}"]:visible`).first().click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href);
}

async function adsView(page: Page): Promise<AdsView> {
  const response = await page.request.get("/api/ads");
  expect(response.ok()).toBe(true);
  return response.json();
}

async function verifyVisuals(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page, request }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.goto("/ads");
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test("honest disconnected state, isolated sample dashboard, useful visual reports and accessible views", async ({ page }, testInfo) => {
  await expect(page.getByRole("heading", { name: "Ads & next steps", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Let’s bring your Facebook ads into focus.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh my ads", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Explore sample dashboard", exact: true }).click();
  await expect(page.getByText("DESIGN PREVIEW · FICTIONAL SAMPLE DATA", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Syndicate · sample campaign", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save experiment to my Desk" }).first()).toBeDisabled();
  await expect(page.getByRole("heading", { name: "A little clarity before your next move.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Syndicate · sample book/ }).click();
  await expect(page.getByRole("heading", { name: "Backlist discovery · sample campaign", exact: true })).toHaveCount(0);
  await expect(page.locator(".ads-metric").filter({ hasText: "Link clicks" }).first()).toContainText("140");
  await page.getByRole("group", { name: "Chart metric", exact: true }).getByRole("button", { name: "Cost per link click", exact: true }).click();
  await page.getByRole("group", { name: "Inspect a chart day", exact: true }).getByRole("button", { name: "Sep 14", exact: true }).click();
  await expect(page.locator(".ads-day-readout")).toContainText("$0.60");
  await expect(page.locator(".ads-day-readout")).toContainText("$0.48");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("group", { name: "Inspect a chart day", exact: true }).getByRole("button", { name: "Sep 15", exact: true })).toBeFocused();
  await expect(page.locator(".ads-day-readout")).toContainText("Sep 15");
  await page.keyboard.press("End");
  await expect(page.locator(".ads-day-readout")).toContainText("Sep 20");
  await page.keyboard.press("Home");
  await expect(page.locator(".ads-day-readout")).toContainText("Sep 14");
  await page.getByLabel("Compare previous 7 days", { exact: true }).uncheck();
  await expect(page.locator(".ads-day-readout")).not.toContainText("$0.48");
  await page.getByRole("button", { name: /All books/ }).click();
  await page.locator(".ads-tabs").getByRole("button", { name: "Ads & creatives", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cover-led creative · sample", exact: true })).toBeVisible();
  await page.getByLabel("Find an ad").fill("Reader invitation");
  await expect(page.locator(".ads-campaign-grid > .ads-panel")).toHaveCount(1);
  await page.locator(".ads-tabs").getByRole("button", { name: "Overview", exact: true }).click();
  await verifyVisuals(page, testInfo, "ads-overview");
  const email = await page.request.get("/api/ads/report?preview=true");
  expect(email.status()).toBe(200);
  expect(await email.text()).toContain("FICTIONAL SAMPLE DATA");
  expect((await adsView(page)).reports).toHaveLength(0);
  await page.getByRole("button", { name: "Return to my data", exact: true }).click();
  await expect(page.getByText("Syndicate · sample campaign", { exact: true })).toHaveCount(0);
  await openSetup(page);
  await expect(page.getByRole("button", { name: "Connect Facebook Ads", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enable my Monday & Thursday emails", exact: true })).toBeDisabled();
});

test("explains hourly and ambiguous result exports before a save request", async ({ page }, testInfo) => {
  let importRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/ads/import") importRequests += 1; });
  await openSetup(page);
  await selectCsv(page, "This is not a CSV export", "unsupported.xlsx");
  await expect(page.getByRole("alert")).toContainText("Choose a CSV file under 2 MB.");
  await expect(page.getByRole("button", { name: "Review my import", exact: true })).toBeDisabled();
  const hourly = dailyCsv().replace("Day,", "Time of day (ad account time zone),Day,")
    .replace("2026-01-01,", "00:00:00 - 00:59:59,2026-01-01,")
    .replace("2026-01-14,", "00:00:00 - 00:59:59,2026-01-14,");
  await selectCsv(page, hourly, "hourly-export.csv");
  await expect(page.getByText("Remove the Time of day breakdown and export one row per ad per day.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save report & view dashboard", exact: true })).toHaveCount(0);
  await verifyVisuals(page, testInfo, "ads-import-hourly-error");
  await selectCsv(page, dailyCsv().replace("Link clicks", "Results"), "ambiguous-results.csv");
  await expect(page.getByText("Add an explicit Link clicks column in Ads Manager. Results can mix different metrics and cannot be used as Link clicks.", { exact: true })).toBeVisible();
  expect(importRequests).toBe(0);
  expect((await adsView(page)).reports).toHaveLength(0);
});

test("reviews an import before saving, remembers account settings and preserves report history", async ({ page }, testInfo) => {
  let importRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/ads/import") importRequests += 1; });
  await page.getByRole("button", { name: "Add a new report", exact: true }).click();
  await selectCsv(page, dailyCsv({ currency: "EUR" }));
  await expect(page.getByLabel("First day", { exact: true })).toHaveValue("2026-01-01");
  await expect(page.getByLabel("Last day (14 days total)", { exact: true })).toHaveValue("2026-01-14");
  await expect(page.getByLabel("Currency (three-letter code)", { exact: true })).toHaveValue("EUR");
  await expect(page.getByLabel("Account timezone", { exact: true })).toHaveValue("");
  await page.getByLabel("Account label", { exact: true }).fill("Synthetic exported account");
  await page.getByLabel("Account timezone", { exact: true }).fill("Europe/London");
  const review = page.getByRole("button", { name: "Review my import", exact: true });
  await review.focus();
  await expect(review).toBeFocused();
  await page.keyboard.press("Enter");
  const preview = page.getByRole("region", { name: "Import preview", exact: true });
  await expect(preview.getByRole("heading", { name: "Ready to add this report?", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save report & view dashboard", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Edit import details", exact: true })).toBeFocused();
  await expect(preview).toContainText("EUR");
  await expect(preview).toContainText("Europe/London");
  expect(importRequests).toBe(0);
  expect((await adsView(page)).reports).toHaveLength(0);
  await verifyVisuals(page, testInfo, "ads-import-preview");

  // Editing is a reversible step; it must not accidentally save the reviewed file.
  await page.getByRole("button", { name: "Edit import details", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(importRequests).toBe(0);
  await review.click();
  await page.getByRole("button", { name: "Save report & view dashboard", exact: true }).click();
  await expect(page.getByText("MANUAL ADS MANAGER EXPORT · NOT LIVE SYNCED", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fixture campaign", exact: true })).toBeVisible();
  expect(importRequests).toBe(1);
  const first = (await adsView(page)).reports[0];
  expect(first.snapshot.data_origin).toBe("manual_snapshot");
  expect(first.snapshot.account).toMatchObject({ name: "Synthetic exported account", currency: "EUR", timezone_name: "Europe/London" });
  expect(first.snapshot.rows[1].spend).toBe(12);
  await page.reload();
  await page.getByRole("button", { name: "Add a new report", exact: true }).click();
  await expect(page.getByLabel("Account label", { exact: true })).toHaveValue("Synthetic exported account");
  await expect(page.getByLabel("Currency (three-letter code)", { exact: true })).toHaveValue("EUR");
  await expect(page.getByLabel("Account timezone", { exact: true })).toHaveValue("Europe/London");
  await selectCsv(page, dailyCsv({ currency: "EUR" }), "same-report.csv");
  await review.click();
  await expect(page.getByText("This report is already in your recent history.", { exact: true })).toBeVisible();
  await expect(preview).toHaveCount(0);
  await page.getByRole("button", { name: "Open saved report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture campaign", exact: true })).toBeVisible();
  expect(importRequests).toBe(1);
  await page.getByRole("button", { name: "Add a new report", exact: true }).click();
  await selectCsv(page, dailyCsv({ currency: "EUR", since: "2026-01-08", until: "2026-01-21", spend: 24, campaign: "Updated fixture campaign" }), "next-week.csv");
  await expect(page.getByLabel("First day", { exact: true })).toHaveValue("2026-01-08");
  await expect(page.getByLabel("Last day (14 days total)", { exact: true })).toHaveValue("2026-01-21");
  await review.click();
  await expect(preview).toBeVisible();
  expect(importRequests).toBe(1);
  await page.getByRole("button", { name: "Save report & view dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Updated fixture campaign", exact: true })).toBeVisible();
  const saved = await adsView(page);
  expect(saved.reports).toHaveLength(2);
  expect(saved.reports.find(report => report.id === first.id)).toEqual(first);
  await openSetup(page);
  await expect(page.getByRole("heading", { name: "Your report shelf", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open report", exact: true })).toHaveCount(2);
  await page.locator(".ads-report-row").filter({ hasText: "2026-01-01" }).getByRole("button", { name: "Open report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture campaign", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Updated fixture campaign", exact: true })).toHaveCount(0);
  await page.getByRole("group", { name: "Inspect a chart day", exact: true }).getByRole("button", { name: "Jan 9", exact: true }).click();
  await expect(page.locator(".ads-day-readout")).toContainText("No rows reported");
  await verifyVisuals(page, testInfo, "ads-manual-overview");
});

test("keeps imported campaign mappings and sourced inspiration after reload", async ({ page }) => {
  await openSetup(page);
  await selectCsv(page, dailyCsv());
  await page.getByLabel("Account label", { exact: true }).fill("Synthetic exported account");
  await page.getByLabel("Account timezone", { exact: true }).fill("America/Phoenix");
  await page.getByRole("button", { name: "Review my import", exact: true }).click();
  await page.getByRole("button", { name: "Save report & view dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture campaign", exact: true })).toBeVisible();
  await page.reload();
  const mapping = page.getByRole("combobox", { name: /Which book is this campaign for/ });
  const title = await mapping.locator("option").nth(1).textContent();
  await mapping.selectOption({ index: 1 });
  await expect(page.locator(".ads-book-filters button").filter({ hasText: title! })).toBeVisible();
  await page.reload();
  await page.locator(".ads-book-filters button").filter({ hasText: title! }).click();
  await expect(page.locator(".ads-scope-label")).toContainText(title!);
  await page.getByRole("group", { name: "Choose an experiment", exact: true }).getByRole("button", { name: "Check the book journey", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Follow the click all the way through.", exact: true })).toBeVisible();
  await expect(page.locator(".ads-experiment-steps")).toContainText("Purchase data is unavailable");
  await expect(page.locator(".ads-experiment-steps")).toContainText("What to measure");
  await page.getByRole("button", { name: "Save experiment to my Desk", exact: true }).click();
  await expect(page.getByText("Saved to Cassandra’s Desk for review.", { exact: true })).toBeVisible();
  await page.locator(".ads-tabs").getByRole("button", { name: "Ideas & inspiration", exact: true }).click();
  await page.getByLabel("Give this example a name", { exact: true }).fill("Synthetic inspiration");
  await page.getByLabel("Meta Ad Library link", { exact: true }).fill("https://www.facebook.com/ads/library/?id=123");
  await page.getByLabel("What would you test?", { exact: true }).fill("Test a clearer cover crop. Performance unknown.");
  await page.getByRole("button", { name: "Save inspiration", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic inspiration", exact: true })).toBeVisible();
  await page.reload();
  await page.locator(".ads-tabs").getByRole("button", { name: "Ideas & inspiration", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic inspiration", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("prepares a sourced Raven question only on request and protects an existing unsent draft", async ({ page }, testInfo) => {
  const generationRequests: string[] = [];
  // Expose the editable question form in the local fixture without invoking a model.
  await page.route("**/api/studio*", route => {
    if (route.request().method() !== "GET") {
      generationRequests.push(route.request().method());
      return route.abort();
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      role: "owner", availability: { available: true, reason: "ready", message: "Simulated browser-test availability; no model is called." },
      generations: [], generation: null,
    }) });
  });
  await page.getByRole("button", { name: "Explore sample dashboard", exact: true }).click();
  await page.locator(".ads-tabs").getByRole("button", { name: "Ideas & inspiration", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Understand my click costs/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Plan a small creative test/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^See what I’m missing/ })).toBeDisabled();
  await page.getByRole("button", { name: "Add a new report", exact: true }).click();
  await selectCsv(page, dailyCsv());
  await page.getByLabel("Account label", { exact: true }).fill("Synthetic exported account");
  await page.getByLabel("Account timezone", { exact: true }).fill("America/Phoenix");
  await page.getByRole("button", { name: "Review my import", exact: true }).click();
  await page.getByRole("button", { name: "Save report & view dashboard", exact: true }).click();
  const mapping = page.getByRole("combobox", { name: /Which book is this campaign for/ });
  const title = await mapping.locator("option").nth(1).textContent();
  await mapping.selectOption({ index: 1 });
  await expect(page.locator(".ads-book-filters button").filter({ hasText: title! })).toBeVisible();
  const report = (await adsView(page)).reports[0];
  await page.locator(".ads-tabs").getByRole("button", { name: "Ideas & inspiration", exact: true }).click();
  await page.getByRole("button", { name: /^Understand my click costs/ }).click();
  await expect(page).toHaveURL(/\/studio$/);
  const question = page.getByLabel("Your question and useful context", { exact: true });
  await expect(question).toHaveValue(/Explain the click-cost changes in plain language/);
  const prepared = await question.inputValue();
  expect(prepared).toContain(`/ads?report=${report.id}`);
  expect(prepared).toContain('"origin": "manual_snapshot"');
  expect(prepared).toContain('"linkClicks": 18');
  expect(prepared).toContain('"linkClicks": 20');
  expect(prepared).toContain("Missing dates are not proof of zero activity");
  await expect(page.locator(".studio-book-selection label").filter({ hasText: title! }).getByRole("checkbox")).toBeChecked();
  expect(generationRequests).toEqual([]);

  const unfinished = "Keep my unsent private question about a different book promotion.";
  await question.fill(unfinished);
  await navigate(page, "/ads");
  await page.locator(".ads-tabs").getByRole("button", { name: "Ideas & inspiration", exact: true }).click();
  await page.getByRole("button", { name: /^Plan a small creative test/ }).click();
  const confirmation = page.getByRole("dialog", { name: "Keep your unfinished question?", exact: true });
  await expect(confirmation).toBeVisible();
  await verifyVisuals(page, testInfo, "ads-raven-draft-choice");
  await confirmation.getByRole("button", { name: "Stay with my report", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(page).toHaveURL(/\/ads$/);
  await page.getByRole("button", { name: /^Plan a small creative test/ }).click();
  await confirmation.getByRole("button", { name: "Open my current question", exact: true }).click();
  await expect(question).toHaveValue(unfinished);
  await navigate(page, "/ads");
  await page.locator(".ads-tabs").getByRole("button", { name: "Ideas & inspiration", exact: true }).click();
  await page.getByRole("button", { name: /^Plan a small creative test/ }).click();
  await confirmation.getByRole("button", { name: "Use report question", exact: true }).click();
  await expect(question).toHaveValue(/Help me plan one small marketing experiment/);
  expect(await question.inputValue()).toContain(`/ads?report=${report.id}`);
  expect(await question.inputValue()).not.toContain(unfinished);
  expect(generationRequests).toEqual([]);
});
