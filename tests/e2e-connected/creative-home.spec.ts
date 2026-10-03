import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });
// Public artwork is injected only into this synthetic actor's display responses.
// Production tenant gating is independently verified in workspace-resume.test.ts.
const artwork = ["Rayla", "Avery", "Cosmo", "Ax", "Lex", "Falcon"].map(name => ({
  id: `published-${name.toLowerCase()}`, name, image_url: `/artwork/kira/${name.toLowerCase()}.jpg`,
  alt: `${name}'s illustrated character sticker, photographed for Kira Stanley's published shop`,
  collection: "Syndicate Mafia", source_url: "https://www.kirastanleyauthor.com/product-page/syndicate-mafia-character-stickers",
}));
async function showPublishedArt(page: Page) {
  await page.route("**/api/workspace/resume", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), artwork } });
  });
  await page.route("**/api/characters", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), publishedArtwork: artwork } });
  });
}
test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("welcome note has useful destinations and dismissal survives a reload", async ({ page }, testInfo) => {
  await showPublishedArt(page); await page.reload();
  const note = page.getByRole("complementary", { name: "Welcome back, Cassandra.", exact: true });
  await expect(note).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue my saved work", exact: true })).toHaveAttribute("href", "#continue-work");
  expect(await page.evaluate(() => document.querySelector("#continue-work")!.compareDocumentPosition(document.querySelector(".creative-next")!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  for (const href of ["/characters", "/universe", "/ads", "/quiet-room"]) await expect(note.locator(`a[href="${href}"]`)).toBeVisible();
  await expect(page.locator(".creative-art-caption")).toContainText("Rayla");
  await expect(page.locator(".creative-art-image img")).toBeVisible();
  await expect.poll(() => page.locator(".creative-art-image img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("creative-home.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await note.getByRole("button", { name: "Dismiss the welcome note", exact: true }).click();
  await expect(note).toHaveCount(0); await page.reload(); await expect(note).toHaveCount(0);
  await page.getByRole("button", { name: "What’s new in KIRA", exact: true }).click(); await expect(note).toBeVisible();
});

test("artwork respects reduced motion and offers manual controls and an image failure fallback", async ({ page }) => {
  await showPublishedArt(page); await page.reload();
  const carousel = page.getByRole("region", { name: "Your character artwork", exact: true });
  await expect(carousel).toContainText("Rayla");
  await expect(carousel.getByRole("button", { name: "Pause artwork rotation" })).toHaveCount(0);
  await page.clock.install(); await page.clock.fastForward(15000); await expect(carousel).toContainText("Rayla");
  await carousel.getByRole("button", { name: "Next artwork", exact: true }).click();
  await expect(carousel).toContainText("Avery");
  await carousel.getByRole("button", { name: "Show Lex", exact: true }).click();
  await expect(carousel).toContainText("Lex");
  await page.locator(".creative-art-image img").evaluate(image => image.dispatchEvent(new Event("error")));
  await expect(carousel).toContainText("This artwork couldn’t be opened.");
  await carousel.getByRole("button", { name: "Previous artwork", exact: true }).click();
  await expect(page.locator(".creative-art-image img")).toBeVisible();
});

test("published portrait opens full size and creates only an explicitly saved private profile", async ({ page }, testInfo) => {
  await showPublishedArt(page); await page.goto("/characters");
  await expect(page.locator(".published-cast-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Look closer at Rayla", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Rayla", exact: true });
  await expect(viewer).toContainText("does not create book facts");
  await expect(page.locator("a.character-card")).toHaveCount(0);
  await viewer.getByRole("button", { name: "Start a private profile", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add a character", exact: true });
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Rayla");
  await form.getByLabel(/Your own description/).fill("Synthetic author-confirmed description for this test.");
  await form.getByRole("button", { name: "Keep draft and close", exact: true }).click();
  await page.getByRole("button", { name: "Look closer at Avery", exact: true }).click();
  await page.getByRole("dialog", { name: "Avery", exact: true }).getByRole("button", { name: "Resume your unfinished character", exact: true }).click();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Rayla");
  await expect(form.getByLabel(/Your own description/)).toHaveValue("Synthetic author-confirmed description for this test.");
  await form.getByRole("button", { name: "Add character", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rayla", exact: true })).toBeVisible();
  await page.goto("/characters");
  await expect(page.locator("a.character-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Your private character profiles", exact: true })).toBeVisible();
  await expect(page.locator(".published-cast-disclosure")).not.toHaveAttribute("open");
  await page.getByLabel("Search private profiles by name or alias", { exact: true }).fill("Cosmo");
  await expect(page.getByRole("heading", { name: "No private profile found.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Look closer at Cosmo", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("creative-character-studio.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("note dismissal still works in this tab when browser storage is full", async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Storage is full", "QuotaExceededError"); }; });
  const note = page.getByRole("complementary", { name: "Welcome back, Cassandra.", exact: true });
  await note.getByRole("button", { name: "Dismiss the welcome note", exact: true }).click();
  await expect(note).toHaveCount(0);
  await page.getByRole("button", { name: "What’s new in KIRA", exact: true }).click();
  await expect(note).toBeVisible();
});

test("a withdrawn manuscript stays visible as a book-details destination on home", async ({ page }) => {
  await page.route("**/api/workspace/resume", async route => {
    const response = await route.fetch(); const data = await response.json();
    data.books[0].reading = { id: "30000000-0000-4000-8000-000000000001", version: 1, status: "withdrawn", completed_chunks: 1, chunk_count: 1, job_state: "paused" };
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  const resume = page.getByRole("region", { name: "Continue your work", exact: true });
  const book = resume.getByRole("link").filter({ hasText: "Manuscript withdrawn from use" });
  await expect(book).toBeVisible();
  await expect(book).toContainText("Open book details");
  await expect(book).not.toHaveAttribute("href", /#reading-status/);
  await expect(resume).not.toContainText("Saved activity could not be refreshed");
});

test.describe("rotation controls", () => {
  test.use({ reducedMotion: "no-preference" });
  test("rotation can be played and paused without advancing while paused", async ({ page }) => {
    await showPublishedArt(page); await page.reload();
    const carousel = page.getByRole("region", { name: "Your character artwork", exact: true });
    await expect(carousel).toContainText("Rayla");
    await page.clock.install(); await page.mouse.move(0, 0);
    await carousel.getByRole("button", { name: "Pause artwork rotation", exact: true }).click();
    await page.clock.fastForward(15000); await expect(carousel).toContainText("Rayla");
    await carousel.getByRole("button", { name: "Play artwork rotation", exact: true }).click();
    await page.mouse.move(0, 0); await page.clock.fastForward(15000);
    await expect(carousel).toContainText("Avery");
    await carousel.getByRole("button", { name: "Show Rayla", exact: true }).click();
    await page.clock.fastForward(15000); await expect(carousel).toContainText("Rayla");
  });
});
