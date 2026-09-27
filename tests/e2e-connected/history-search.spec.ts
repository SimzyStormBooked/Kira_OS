import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./fixture-data";
import type { StudioGeneration } from "../../lib/ai/studio-contract";

test.use({ reducedMotion: "reduce" });
const saved = (number: number): StudioGeneration => ({
  id: `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  author_id: fixture.authorId, created_by: fixture.memberId, job: "brainstorm", prompt: `Synthetic question ${number}: compare a useful business idea.`,
  model: "google/gemini-3.8-flash", status: "complete",
  result: { kind: "ideas", title: `Saved direction ${number}`, summary: number === 1 ? "Consider an orchard newsletter with existing reader permission." : "Compare a small next step.", options: [{ title: "Listen", idea: "Review approved reader comments.", tradeoff: "A small sample.", first_step: "Check permission first.", verify: [] }], questions: [], context_used: [] },
  input_tokens: null, output_tokens: null, estimated_cost_usd: null, gateway_generation_id: null, error_code: null,
  knowledge_context: { book_ids: [], include_spoilers: false, evidence: [] },
  created_at: "2026-09-17T00:00:00.123456+00:00", completed_at: "2026-09-17T00:00:01+00:00",
});
async function signIn(page: Page, email: string = fixture.memberEmail) {
  await page.goto("/login"); await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
async function openSearch(page: Page, query: string) {
  await page.getByRole("button", { name: "Search workspace" }).click();
  await page.getByRole("textbox", { name: "Search books, briefs and pages" }).fill(query);
  return page.getByRole("dialog", { name: "Search your universe" });
}
test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  expect((await request.post(`${fixture.supabaseUrl}/__test/studio`, { data: { generations: Array.from({ length: 61 }, (_, i) => saved(i + 1)) } })).ok()).toBe(true);
  await signIn(page);
});

test("saved history reaches beyond 50, searches answer text and opens old URLs without asking again", async ({ page }) => {
  const paid: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/studio") && request.method() === "POST") paid.push(request.url()); });
  await page.goto("/studio");
  const history = page.locator(".studio-history");
  await expect(history.locator("li")).toHaveCount(25);
  await expect(history.locator("li").first()).toContainText("Saved direction 61");
  await history.getByRole("button", { name: "Load older questions" }).click();
  await expect(history.locator("li")).toHaveCount(50);
  await history.getByRole("button", { name: "Load older questions" }).click();
  await expect(history.locator("li")).toHaveCount(61);
  expect(new Set(await history.locator("li a").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))).size).toBe(61);
  await expect(history.getByRole("button", { name: "Load older questions" })).toHaveCount(0);
  await page.getByLabel("Search saved questions and answers").fill("orchard");
  await page.getByRole("button", { name: "Search history", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(1);
  await history.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/studio/${saved(1).id}$`));
  await expect(page.locator("#studio-result-title")).toHaveText("Saved direction 1");
  await page.reload();
  await expect(page.locator(".studio-summary")).toContainText("orchard newsletter");
  expect(paid).toEqual([]);
});

test("global search finds typed character and old Raven results, alongside books and pages", async ({ page }) => {
  const profile = await page.evaluate(async () => {
    const response = await fetch("/api/characters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Orchard Keeper", summary: "Synthetic author profile for retrieval verification.", aliases: [] }) });
    if (!response.ok) throw new Error("Profile setup failed");
    return (await response.json()).profile as { id: string };
  });
  let dialog = await openSearch(page, "orchard");
  const character = dialog.getByRole("link").filter({ hasText: "Character profile" });
  const answer = dialog.getByRole("link").filter({ hasText: "Raven answer" });
  await expect(character).toHaveAttribute("href", `/characters/${profile.id}`);
  await expect(answer).toHaveAttribute("href", `/studio/${saved(1).id}`);
  await answer.click();
  await expect(page.locator("#studio-result-title")).toHaveText("Saved direction 1");
  dialog = await openSearch(page, "password");
  await expect(dialog.getByRole("link", { name: "Settings Workspace", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  dialog = await openSearch(page, "book");
  await expect(dialog.getByRole("link").filter({ hasText: "The Universe" })).toBeVisible();
});

test("viewer access can retrieve and search saved answers without generation permission", async ({ page, browser }) => {
  expect(await page.evaluate(async email => (await fetch("/api/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", email, role: "viewer" }) })).status, fixture.outsiderEmail)).toBe(200);
  const context = await browser.newContext({ baseURL: fixture.appUrl });
  const viewer = await context.newPage();
  try {
    await signIn(viewer, fixture.outsiderEmail);
    await viewer.goto(`/studio/${saved(1).id}`);
    await expect(viewer.locator("#studio-result-title")).toHaveText("Saved direction 1");
    await expect(viewer.getByRole("button", { name: "Ask Raven", exact: true })).toHaveCount(0);
    const dialog = await openSearch(viewer, "orchard");
    await expect(dialog.getByRole("link").filter({ hasText: "Raven answer" })).toHaveAttribute("href", `/studio/${saved(1).id}`);
  } finally { await context.close(); }
});

test("search discards stale responses and hides saved results when the session ends", async ({ page }) => {
  await page.goto("/desk");
  await page.getByLabel("Give it a title", { exact: true }).fill("An unsent note to keep");
  await page.getByLabel("Your idea", { exact: true }).fill("Preserve these unfinished words after session expiry.");
  let release: (() => void) | undefined;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/search?q=*", async route => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "delayed") {
      await delayed;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ id: saved(1).id, kind: "raven-answer", title: "Stale private answer", excerpt: "Never display after query change." }] }) }).catch(() => {});
    } else if (query === "expired") await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Session expired" }) });
    else await route.continue();
  });
  const started = page.waitForRequest(request => request.url().endsWith("/api/search?q=delayed"));
  const dialog = await openSearch(page, "delayed");
  await started;
  await dialog.getByRole("textbox").fill("orchard");
  await expect(dialog.getByRole("link").filter({ hasText: "Raven answer" })).toBeVisible();
  release!();
  await expect(dialog).not.toContainText("Stale private answer");
  await dialog.getByRole("textbox").fill("expired");
  await expect(page.getByRole("dialog", { name: /session/i })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Search your universe" })).toHaveCount(0);
  await expect(page.getByText("Stale private answer")).toHaveCount(0);
  await expect(page.getByRole("link").filter({ hasText: "Saved direction 1" })).toHaveCount(0);
});
