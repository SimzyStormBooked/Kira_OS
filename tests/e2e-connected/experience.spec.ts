import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });

async function guideTo(page: Page, href: string) {
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Make yourself at home." });
  await guide.locator(`a[href="${href}"]`).click();
  await expect(guide).not.toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href);
}

async function openIdeas(page: Page) {
  await page.getByRole("banner").getByRole("button", { name: "Find a spark", exact: true }).click();
  const ideas = page.getByRole("dialog", { name: "A little inspiration" });
  await expect(ideas).toBeVisible();
  return ideas;
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("a curated idea opens an unsaved brief and saves only after Cassy chooses", async ({ page }, testInfo) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/workspace") && request.method() === "PATCH") mutations.push(request.postData() ?? "");
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (testInfo.project.name === "connected-mobile") {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: viewport.height });
    const header = page.getByRole("banner");
    await expect(header.getByText("Find a spark", { exact: true })).toBeVisible();
    await expect(header.getByText("Guide", { exact: true })).toBeVisible();
    expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await header.locator("button").evaluateAll((buttons) => buttons.every((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("experience-home-320.png") });
    await page.setViewportSize(viewport);
  }
  await page.screenshot({ path: testInfo.outputPath("experience-home.png"), fullPage: true });
  const ideas = await openIdeas(page);
  await expect(ideas.getByRole("heading", { name: "The book you still think about." })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("experience-inspiration.png") });
  await ideas.getByRole("link", { name: "Use this idea", exact: true }).click();
  await expect(page).toHaveURL(/\/desk\?idea=return-to-a-title$/);
  const title = page.getByLabel("Give it a title");
  const brief = page.getByLabel("Your idea", { exact: true });
  await expect(title).toHaveValue("Reintroduce a title I love");
  await expect(title).toBeFocused();
  await expect(brief).toHaveValue(/CURATED REFLECTION/);
  await expect(page.locator("#manual-draft-state")).toContainText("Not saved yet");
  expect(mutations).toHaveLength(0);

  await title.fill("A personal idea to review");
  await brief.fill("I want to revisit one approved description and decide if it still fits my readers.");
  await page.getByRole("button", { name: "Save for review", exact: true }).click();
  const card = page.locator(".approval-card").filter({ has: page.getByRole("heading", { name: "A personal idea to review", exact: true }) });
  await expect(card).toBeVisible();
  await expect(title).toHaveValue("");
  await expect(brief).toHaveValue("");
  expect(mutations).toHaveLength(1);
  await expect(page).toHaveURL(/\/desk$/);
  const reusedIdea = await openIdeas(page);
  await reusedIdea.getByRole("link", { name: "Use this idea", exact: true }).click();
  await expect(title).toHaveValue("Reintroduce a title I love");
  expect(mutations).toHaveLength(1);
  await title.fill("Another way to revisit my books");
  await brief.fill("A separate thought I chose to save after returning to the same starting question.");
  await page.getByRole("button", { name: "Save for review", exact: true }).click();
  await expect(title).toHaveValue("");
  expect(mutations).toHaveLength(2);
  await expect(page).toHaveURL(/\/desk$/);
  expect(new URL(page.url()).search).not.toContain("personal");
  await page.reload();
  await expect(card).toContainText("one approved description");
  expect(await page.evaluate(() => localStorage.getItem("kira-os:phase-one:v1"))).toBeNull();
});

test("a slow save preserves the submitted brief and leaves a newly chosen idea unsaved", async ({ page }) => {
  const firstIdea = await openIdeas(page);
  await firstIdea.getByRole("link", { name: "Use this idea", exact: true }).click();
  const title = page.getByLabel("Give it a title");
  const brief = page.getByLabel("Your idea", { exact: true });
  await expect(title).toHaveValue("Reintroduce a title I love");
  await title.fill("My first idea, saved deliberately");
  await brief.fill("This is the exact brief I chose to save before exploring a different idea.");

  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  let writes = 0;
  await page.route(/\/api\/workspace$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    writes += 1;
    const response = await route.fetch();
    await responseGate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Save for review", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saving your idea…", exact: true })).toBeVisible();
    const nextIdea = await openIdeas(page);
    await nextIdea.getByRole("button", { name: "Next idea", exact: true }).click();
    await nextIdea.getByRole("link", { name: "Use this idea", exact: true }).click();
    await expect(page).toHaveURL(/\/desk\?idea=rediscover-an-asset$/);
    const choice = page.getByRole("region", { name: "Keep your unfinished idea" });
    await expect(choice).toBeVisible();
    await expect(choice.getByRole("button", { name: "Replace with this idea", exact: true })).toBeDisabled();
    await expect(choice.getByRole("button", { name: "Keep my draft", exact: true })).toBeDisabled();
    await expect(title).toHaveValue("My first idea, saved deliberately");
    await expect(brief).toHaveValue("This is the exact brief I chose to save before exploring a different idea.");
    releaseResponse();
    await expect(page.getByRole("heading", { name: "My first idea, saved deliberately", exact: true })).toBeVisible();
    await expect(title).toHaveValue("Revisit an approved promotional asset");
    await expect(page.locator("#manual-draft-state")).toContainText("Not saved yet");
    await expect(page).toHaveURL(/\/desk\?idea=rediscover-an-asset$/);
    expect(writes).toBe(1);
    const state = await page.evaluate(async () => (await fetch("/api/workspace")).json());
    expect(state.approvals).toHaveLength(1);
    expect(state.approvals[0].title).toBe("My first idea, saved deliberately");
  } finally {
    releaseResponse();
  }
});

test("an unfinished idea survives exploring and a second idea asks before replacing it", async ({ page }) => {
  await guideTo(page, "/desk");
  const title = page.getByLabel("Give it a title");
  const brief = page.getByLabel("Your idea", { exact: true });
  await title.fill("My unfinished thought");
  await brief.fill("These are my own words, still in progress.");
  await guideTo(page, "/universe");
  await expect(page.locator(".book-card")).toHaveCount(8);
  await guideTo(page, "/desk");
  await expect(title).toHaveValue("My unfinished thought");
  await expect(brief).toHaveValue("These are my own words, still in progress.");

  const ideas = await openIdeas(page);
  await ideas.getByRole("link", { name: "Use this idea", exact: true }).click();
  const choice = page.getByRole("region", { name: "Keep your unfinished idea" });
  await expect(choice).toBeVisible();
  await expect(title).toHaveValue("My unfinished thought");
  await choice.getByRole("button", { name: "Keep my draft", exact: true }).click();
  await expect(choice).not.toBeVisible();
  await expect(brief).toHaveValue("These are my own words, still in progress.");
  await expect(title).toBeFocused();

  const second = await openIdeas(page);
  await second.getByRole("button", { name: "Next idea", exact: true }).click();
  await second.getByRole("link", { name: "Use this idea", exact: true }).click();
  await expect(choice).toBeVisible();
  await expect(brief).toHaveValue("These are my own words, still in progress.");
  await choice.getByRole("button", { name: "Replace with this idea", exact: true }).click();
  await expect(title).toHaveValue("Revisit an approved promotional asset");
  await expect(title).toBeFocused();
  await expect(page.locator("#manual-draft-state")).toContainText("Not saved yet");
  const state = await page.evaluate(async () => (await fetch("/api/workspace")).json());
  expect(state.approvals).toHaveLength(0);
  expect(await page.evaluate(() => Object.values(localStorage).some((value) => String(value).includes("My unfinished thought")))).toBe(false);
});

test("first steps and help reopen with keyboard focus and explain the current page", async ({ page }) => {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const firstSteps = page.getByRole("heading", { name: "Start with one small thing." });
  await expect(firstSteps).toBeVisible();
  await page.getByRole("button", { name: "Hide for now", exact: true }).click();
  const reopen = page.getByRole("button", { name: "Show my first steps", exact: true });
  await expect(reopen).toBeFocused();
  await reopen.press("Enter");
  await expect(firstSteps).toBeVisible();
  await expect(firstSteps).toBeFocused();

  const trigger = page.getByRole("button", { name: "Guide", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const guide = page.getByRole("dialog", { name: "Make yourself at home." });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("It does not publish, send, or purchase anything");
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(guide).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await guideTo(page, "/desk");
  const help = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "How does my desk work?" }) });
  await expect(help).not.toHaveAttribute("open", "");
  await help.locator("summary").focus();
  await help.locator("summary").press("Enter");
  await expect(help).toHaveAttribute("open", "");
  await expect(help).toContainText("Teach Raven saves");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
