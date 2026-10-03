import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";
import type { StudioGeneration } from "../../lib/ai/studio-contract";

test.use({ reducedMotion: "reduce" });
const answer: StudioGeneration = {
  id: "48000000-0000-4000-8000-000000000001", author_id: fixture.authorId, created_by: fixture.memberId,
  job: "brainstorm", prompt: "Synthetic question for the private home summary.", model: "google/gemini-3.8-flash", status: "complete",
  result: { kind: "ideas", title: "A saved marketing direction", summary: "A synthetic summary for browser verification.", options: [{ title: "Review", idea: "Review the available evidence.", tradeoff: "The evidence is limited.", first_step: "Read the sources.", verify: [] }], questions: [], context_used: [] },
  input_tokens: null, output_tokens: null, estimated_cost_usd: null, gateway_generation_id: null, error_code: null,
  knowledge_context: { book_ids: [], include_spoilers: false, evidence: [] }, created_at: "2026-09-26T10:00:00Z", completed_at: "2026-09-26T10:00:01Z",
};

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("home resumes saved work and first steps link to persistent book knowledge views", async ({ page, request }, testInfo) => {
  const book = await page.evaluate(async () => {
    const response = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Synthetic Daily Book" }) });
    if (!response.ok) throw new Error("Book setup failed");
    return (await response.json()).book as { id: string; slug: string };
  });
  expect((await request.post(`${fixture.supabaseUrl}/__test/manuscripts`, { data: { bookId: book.id, text: "Rowan coordinates the synthetic archive for this interface test." } })).ok()).toBe(true);
  expect((await request.post(`${fixture.supabaseUrl}/__test/studio`, { data: { generations: [answer] } })).ok()).toBe(true);
  await page.reload();
  const resume = page.getByRole("region", { name: "Continue your work", exact: true });
  await expect(resume.getByRole("link").filter({ hasText: answer.result!.title })).toHaveAttribute("href", `/studio/${answer.id}`);
  await expect(resume.getByRole("link").filter({ hasText: "Synthetic Daily Book" })).toHaveAttribute("href", `/universe/${book.slug}?knowledge=characters#book-knowledge`);
  await expect(resume).toContainText("Book updated");
  await expect(resume).toContainText("Knowledge ready");
  await page.getByRole("button", { name: "Plan book marketing", exact: true }).click();
  await page.getByRole("link", { name: "Explore this book’s marketing", exact: true }).click();
  await expect(page).toHaveURL(/knowledge=readers#book-knowledge$/);
  await expect(page.getByRole("button", { name: "Marketing", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#main-content .library-upload-disclosure")).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "Story Arc", exact: true }).click();
  await expect(page).toHaveURL(/knowledge=story#book-knowledge$/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Story Arc", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Explore what Raven learned", exact: true })).toBeVisible();
  // Next can retain an earlier route tree; click the visible current disclosure.
  await page.getByText("Add another manuscript version", { exact: true }).filter({ visible: true }).click();
  await expect(page.getByLabel("Manuscript file", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("daily-book-workspace.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Guide covers active destinations and marks future pages as previews", async ({ page }) => {
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Make yourself at home.", exact: true });
  for (const href of ["/characters", "/ads", "/opportunities", "/plans", "/studio", "/settings", "/connections", "/universe"]) await expect(guide.locator(`a[href="${href}"]`)).toBeVisible();
  await guide.getByText("Coming later · 6 previews", { exact: true }).click();
  await expect(guide.getByRole("navigation", { name: "Workspace previews" })).toContainText("No messages are sent here");
  await expect(guide.locator('a[href="/outreach"]')).toContainText("Preview");
  await guide.getByRole("button", { name: "I’ve got it", exact: true }).click();
  await page.getByRole("button", { name: "Review Facebook ads", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open Ads & Next Steps", exact: true })).toHaveAttribute("href", "/ads");
});

test("CSV selection consistently names the file and reports sub-KB size", async ({ page }) => {
  await page.goto("/ads");
  await page.locator(".ads-tabs").getByRole("button", { name: "Reports & setup", exact: true }).click();
  const csv = "Day,Ad ID,Ad name,Campaign ID,Campaign name,Amount spent (USD),Impressions,Link clicks\n2026-01-01,123,Fixture ad,456,Fixture campaign,10,1000,20\n2026-01-14,123,Fixture ad,456,Fixture campaign,12,1000,18";
  const bytes = Buffer.byteLength(csv);
  await page.getByLabel("CSV export", { exact: true }).setInputFiles({ name: "small-report.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator("#ads-selected-file")).toHaveText(`Selected: small-report.csv · ${bytes} bytes`);
  await expect(page.getByRole("button", { name: "Replace CSV file", exact: true })).toBeVisible();
  await expect(page.locator(".ads-import-file-check")).toContainText("Your file is ready to review");
  await expect(page.locator(".ads-import-drop")).not.toContainText("0 KB");
});
