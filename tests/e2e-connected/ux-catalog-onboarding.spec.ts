import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });

async function visitThroughGuide(page: Page, href: string) {
  await page.getByRole("button", { name: "Open workspace guide", exact: true }).click();
  await page.getByRole("dialog", { name: "Make yourself at home." }).locator(`a[href="${href}"]`).click();
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("book details lead with sources and prepare a review brief only on request", async ({ page }) => {
  await page.goto("/universe/crazy-people");
  await expect(page.getByRole("heading", { name: "Crazy People", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View author source", exact: true })).toHaveAttribute("href", "https://www.kirastanleyauthor.com/myalphateam");
  await expect(page.getByRole("heading", { name: "What Kira learned", exact: true })).toBeVisible();
  await expect(page.getByText("Once Kira finishes reading, its findings and characters will appear here with the passages behind them.", { exact: true }).filter({visible:true})).toBeVisible();
  await expect(page.getByLabel("Manuscript file", { exact: true }).filter({visible:true})).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && ["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url());
  });
  await page.getByRole("button", { name: "Prepare book details", exact: true }).click();
  await expect(page).toHaveURL(/\/desk$/);
  await expect(page.getByLabel("Give it a title", { exact: true })).toHaveValue("Review book details · Crazy People");
  const brief = page.getByLabel("Your idea", { exact: true });
  await expect(brief).toHaveValue(/Official source: https:\/\/www.kirastanleyauthor.com\/myalphateam/);
  await expect(brief).toHaveValue(/does not change this catalog or publish anything/);
  expect(writes).toHaveLength(0);
  const original = await brief.inputValue();
  await brief.fill(`${original}\n\nMY REVIEW NOTE\nI will collect the author-approved description before approving any catalog update.`);
  await page.getByRole("button", { name: "Save for review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review book details · Crazy People", exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.reload();
  const saved = page.locator(".approval-card").filter({ has: page.getByRole("heading", { name: "Review book details · Crazy People", exact: true }) });
  await expect(saved).toContainText("MY REVIEW NOTE");
  await expect(saved).toContainText("Official source: https://www.kirastanleyauthor.com/myalphateam");
});

test("collecting catalog materials protects an unfinished desk brief", async ({ page }) => {
  await page.goto("/desk");
  await page.getByLabel("Give it a title", { exact: true }).fill("Keep my existing idea");
  await page.getByLabel("Your idea", { exact: true }).fill("These words must survive exploring the catalog.");
  await visitThroughGuide(page, "/universe");
  await page.locator('a.book-card[href="/universe/crazy-people"]').click();
  const prepare = page.getByRole("button", { name: "Prepare book details", exact: true });
  await prepare.click();
  const choice = page.getByRole("dialog", { name: "Keep your unfinished idea?" });
  await expect(choice).toBeVisible();
  await choice.getByRole("button", { name: "Stay with this book", exact: true }).click();
  await expect(prepare).toBeFocused();
  await prepare.click();
  await choice.getByRole("button", { name: "Open my current brief", exact: true }).click();
  await expect(page.getByLabel("Give it a title", { exact: true })).toHaveValue("Keep my existing idea");
  await expect(page.getByLabel("Your idea", { exact: true })).toHaveValue("These words must survive exploring the catalog.");
  await visitThroughGuide(page, "/universe");
  await page.locator('a.book-card[href="/universe/crazy-people"]').click();
  await prepare.click();
  await choice.getByRole("button", { name: "Replace with book details", exact: true }).click();
  await expect(page.getByLabel("Give it a title", { exact: true })).toHaveValue("Review book details · Crazy People");
  const saved = await page.evaluate(async () => (await fetch("/api/workspace")).json());
  expect(saved.approvals).toHaveLength(0);
});

test("shared starter work is not personal onboarding completion and Raven does not imply monitoring", async ({ page }) => {
  await page.evaluate(async () => {
    const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", title: "Shared starter brief", draft: "This fixture represents work already in the shared workspace." }) });
    if (!response.ok) throw new Error("The shared fixture brief could not be saved.");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Add to your shared desk", exact: true })).toBeVisible();
  await expect(page.getByText("1 shared brief is already here", { exact: true })).toBeVisible();
  await expect(page.locator(".learning-step-complete")).toHaveCount(0);
  await page.goto("/raven");
  await expect(page.getByText("NO CONNECTED FINDINGS YET", { exact: true })).toBeVisible();
  await expect(page.getByText(/Raven is not monitoring your accounts/)).toBeVisible();
  await expect(page.getByText(/DAILY BRIEFING|ALL CLEAR/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recommended moves", exact: true })).toHaveCount(0);
  await page.goto("/campaigns");
  await expect(page.getByRole("link", { name: "Review saved briefs", exact: true })).toHaveAttribute("href", "/desk");
  await expect(page.getByText("Review prepared demo briefs", { exact: true })).toHaveCount(0);
});
