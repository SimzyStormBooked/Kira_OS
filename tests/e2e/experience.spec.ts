import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ reducedMotion: "reduce" });

test("optional inspiration stays still, supports the keyboard, and explains its quote source", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) writes.push(request.url());
  });
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const trigger = page.getByRole("banner").getByRole("button", { name: "Find a spark", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const ideas = page.getByRole("dialog", { name: "A little inspiration" });
  await expect(ideas).toBeVisible();
  const reel = ideas.locator(".inspiration-reel");
  await expect(reel.getByRole("heading")).toHaveText("The book you still think about.");
  await page.clock.fastForward(120000);
  await expect(reel.getByRole("heading")).toHaveText("The book you still think about.");
  await reel.focus();
  await reel.press("ArrowRight");
  await expect(reel.getByRole("heading")).toHaveText("Something beautiful, already yours.");
  await reel.press("Home");
  await expect(reel.getByRole("heading")).toHaveText("The book you still think about.");
  const readers = ideas.getByRole("group", { name: "Filter inspiration ideas" }).getByRole("button", { name: "Readers", exact: true });
  await readers.click();
  await expect(readers).toHaveAttribute("aria-pressed", "true");
  await expect(reel.getByRole("heading")).toHaveText("A little closer to your readers.");
  const quoteSource = ideas.getByRole("link", { name: /Read the source in .+ at Project Gutenberg \(opens in a new tab\)/ });
  await expect(quoteSource).toHaveAttribute("href", /^https:\/\/www\.gutenberg\.org\//);
  await expect(quoteSource).toHaveAttribute("target", "_blank");
  const context = ideas.locator("details");
  await context.locator("summary").click();
  await expect(context).toHaveAttribute("open", "");
  await expect(context).not.toBeEmpty();
  expect(await ideas.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(ideas).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("the guide is optional and a demo idea becomes a saved local brief only on request", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) writes.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const guideTrigger = page.getByRole("button", { name: "Open workspace guide", exact: true });
  await guideTrigger.click();
  const guide = page.getByRole("dialog", { name: "Make yourself at home." });
  await expect(guide).toContainText("You are exploring a demo");
  await page.keyboard.press("Escape");
  await expect(guideTrigger).toBeFocused();
  await guideTrigger.click();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await guide.getByRole("button", { name: "I’ve got it", exact: true }).click();

  await page.getByRole("banner").getByRole("button", { name: "Find a spark", exact: true }).click();
  const ideas = page.getByRole("dialog", { name: "A little inspiration" });
  await ideas.getByRole("link", { name: "Use this idea", exact: true }).click();
  const title = page.getByLabel("Give it a title");
  await expect(title).toHaveValue("Reintroduce a title I love");
  await expect(title).toBeFocused();
  await expect(page.locator("#manual-draft-state")).toContainText("Not saved yet");
  await title.fill("My locally saved demo idea");
  await page.getByLabel("Your brief", { exact: true }).fill("An idea I am trying in this browser, using approved materials only.");
  await page.getByRole("button", { name: "Save for review", exact: true }).click();
  const card = page.locator(".approval-card").filter({ has: page.getByRole("heading", { name: "My locally saved demo idea", exact: true }) });
  await expect(card).toBeVisible();
  expect(writes).toEqual([]);
  await page.reload();
  await expect(card).toContainText("An idea I am trying in this browser");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kira-os:phase-one:v1") ?? "{}").approvals.some((approval: {title:string}) => approval.title === "My locally saved demo idea"))).toBe(true);
});
