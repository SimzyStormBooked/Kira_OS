import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });
async function signIn(page: Page, email: string = fixture.memberEmail) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await signIn(page);
});

test("profile links persist as shortcuts, never OAuth, and can be removed", async ({ page }) => {
  await page.goto("/connections?meta=authorized");
  await expect(page.getByRole("heading", { name: "Your link library" })).toBeVisible();
  await expect(page.getByText("SETUP PENDING", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect with Meta", exact: true })).toHaveCount(0);
  await expect(page.getByText("Meta account access was verified and saved.", { exact: true })).toHaveCount(0);
  for (const [platform, label, url] of [
    ["instagram", "My author Instagram", "https://instagram.com/kirastanleyauthor/?igsh=tracking"],
    ["facebook", "My author Facebook", "https://facebook.com/author.profile"],
  ]) {
    await page.getByLabel("Platform", { exact: true }).selectOption(platform);
    await page.getByLabel("Name this link").fill(label);
    await page.getByLabel("Profile or notebook link").fill(url);
    await page.getByRole("button", { name: "Save link", exact: true }).click();
    await expect(page.getByRole("link", { name: `${label} (opens in a new tab)`, exact: true })).toBeVisible();
  }
  await page.reload();
  const instagram = page.getByRole("link", { name: "My author Instagram (opens in a new tab)", exact: true });
  await expect(instagram).toHaveAttribute("href", "https://www.instagram.com/kirastanleyauthor");
  await expect(page.locator(".connection-link-row").filter({ has: instagram })).toContainText("Link only · Not synced");
  await page.getByRole("button", { name: "Remove My author Instagram", exact: true }).click();
  await expect(instagram).toHaveCount(0);
  await page.reload();
  await expect(instagram).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My author Facebook (opens in a new tab)", exact: true })).toBeVisible();
});

test("NotebookLM copies only explicit temporary text and never sends or saves it", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value: string) => { (window as unknown as { copiedNotebookText: string }).copiedNotebookText = value; },
    } });
  });
  await page.goto("/connections");
  const mutations: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) mutations.push(request.postData() ?? request.url()); });
  const copy = page.getByRole("button", { name: "Copy for NotebookLM", exact: true });
  await expect(copy).toBeDisabled();
  const chosen = "Only this approved business note should leave this box.";
  await page.getByLabel("Text you want to take with you").fill(chosen);
  await copy.click();
  await expect(page.getByText("Copied only the text above. Open your notebook and paste it as a source.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedNotebookText: string }).copiedNotebookText)).toBe(chosen);
  expect(mutations).toEqual([]);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => String(value).includes("approved business note")))).toBe(false);
  await page.reload();
  await expect(page.getByLabel("Text you want to take with you")).toHaveValue("");
});

test("Ask Raven stays disabled before AI setup and does not submit a question", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/studio") && request.method() === "POST") mutations.push(request.postData() ?? ""); });
  await page.goto("/studio");
  await expect(page.getByText("Ask Raven is not available yet", { exact: true })).toBeVisible();
  await expect(page.getByText(/Ask Raven is waiting for the workspace owner/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try a starting question", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your question and useful context")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Raven", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explore Learn & Create", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Finish workspace setup", exact: true })).toHaveAttribute("href", "/settings#setup");
  expect(mutations).toEqual([]);
  await expect(page.getByRole("heading", { name: "Recent questions", exact: true })).toBeVisible();
  await expect(page.getByText("Your first question will appear here when you ask. Nothing runs in the background.", { exact: true })).toBeVisible();
});

test("viewers can see saved links but cannot manage links, Meta authorization, or ask Raven", async ({ page, browser }) => {
  const granted = await page.evaluate(async email => {
    const response = await fetch("/api/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", email, role: "viewer" }) });
    return response.status;
  }, fixture.outsiderEmail);
  expect(granted).toBe(200);
  const viewerContext = await browser.newContext({ baseURL: fixture.appUrl });
  const viewer = await viewerContext.newPage();
  try {
    await signIn(viewer, fixture.outsiderEmail);
    await viewer.goto("/connections");
    await expect(viewer.getByRole("button", { name: "Save link", exact: true })).toBeDisabled();
    await expect(viewer.getByRole("button", { name: "Connect with Meta", exact: true })).toHaveCount(0);
    await expect(viewer.getByText("Owner setup checklist", { exact: true })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    await viewer.goto("/studio");
    await expect(viewer.getByText("Your viewer access lets you read saved answers. An owner or editor can ask a new question.", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Ask Raven", exact: true })).toHaveCount(0);
  } finally { await viewerContext.close(); }
});

test("Connections and Ask Raven fit the screen and pass accessibility checks", async ({ page }, testInfo) => {
  for (const route of ["/connections", "/studio"]) {
    await page.goto(route);
    if (route === "/connections") {
      await page.getByText("Owner setup checklist", { exact: true }).click();
      await expect(page.locator(".connection-setup-details")).toHaveAttribute("open", "");
    } else await expect(page.getByText(/Ask Raven is waiting for the workspace owner/)).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}.png`), fullPage: true });
  }
});
