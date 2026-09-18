import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";
import type { ApprovalRequest } from "../../types/domain";

test.use({ reducedMotion: "reduce" });
async function command(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async (input) => {
    const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error("Synthetic test setup failed");
    return await response.json() as { approvals: ApprovalRequest[] };
  }, body);
}
async function createBrief(page: Page, title: string) {
  const data = await command(page, { action: "create", title, draft: "A synthetic browser-test brief; no external action is authorized." });
  return data.approvals.find((approval) => approval.title === title)!;
}
function cardFor(page: Page, title: string) {
  return page.locator(".approval-card").filter({ has: page.getByRole("heading", { name: title, exact: true, includeHidden: true }) });
}
async function search(page: Page, value: string) {
  await page.getByRole("button", { name: "Search workspace" }).click();
  await page.getByRole("textbox", { name: "Search books, briefs and pages" }).fill(value);
  return page.getByRole("dialog");
}
test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("search finds saved pending and reviewed briefs, opens the correct tab, and focuses the result", async ({ page }) => {
  const pending = await createBrief(page, "Quiet autumn opportunity");
  const reviewed = await createBrief(page, "A previously considered direction");
  await command(page, { action: "decide", id: reviewed.id, decision: { type: "approve" }, version: reviewed.version });
  await page.reload();
  let dialog = await search(page, pending.title);
  await dialog.getByRole("link", { name: `${pending.title} Brief · Needs your eye`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/desk\\?brief=${pending.id}$`));
  await expect(page.getByRole("tab", { name: /Needs your eye/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#brief-${pending.id}`)).toBeFocused();
  await expect(page.locator(`#brief-${pending.id}`)).toBeInViewport();
  dialog = await search(page, reviewed.title);
  await dialog.getByRole("link", { name: `${reviewed.title} Brief · Approved`, exact: true }).click();
  await expect(page.getByRole("tab", { name: /Reviewed/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#brief-${reviewed.id}`)).toBeFocused();
  await expect(cardFor(page, reviewed.title)).toContainText("Decision recorded");
  await page.reload();
  await expect(page.locator(`#brief-${reviewed.id}`)).toBeFocused();
  dialog = await search(page, "password");
  await expect(dialog.getByRole("link", { name: "Settings Workspace", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/desk?brief=not-a-uuid%3Cscript%3E");
  await expect(page.getByRole("tab", { name: /Needs your eye/ })).toHaveAttribute("aria-selected", "true");
  await expect(cardFor(page, pending.title)).toBeVisible();
  await page.goto("/desk?brief=11111111-1111-4111-8111-111111111111");
  await expect(page.getByText("That brief is not available in your workspace.", { exact: false })).toBeVisible();
});

test("decisions explain finality, cancel safely, and write only after explicit confirmation", async ({ page }) => {
  const brief = await createBrief(page, "A decision to make carefully");
  await page.goto("/desk");
  const card = cardFor(page, brief.title);
  const decisions: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/workspace") && request.method() === "PATCH") decisions.push(request.postDataJSON());
  });
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Approve this brief?" });
  await expect(dialog).toContainText(brief.title);
  await expect(dialog).toContainText("final");
  await expect(dialog).toContainText("read-only");
  await expect(dialog).toContainText("Nothing will be published");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(decisions).toHaveLength(0);
  await expect(card).toContainText("pending");
  await card.getByRole("button", { name: "Reject", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Reject this brief?" });
  await expect(dialog).toContainText(brief.title);
  await dialog.getByRole("button", { name: "Confirm rejection", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(decisions).toEqual([{ action: "decide", id: brief.id, decision: { type: "reject" }, version: 0 }]);
  await expect(page.getByRole("tab", { name: /Reviewed/ })).toBeFocused();
  await page.getByRole("tab", { name: /Reviewed/ }).click();
  await expect(card).toContainText("Rejected · Kept for audit history");
  await expect(card.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
});

test("a failed confirmation stays open and can retry without changing the pending brief", async ({ page }) => {
  const brief = await createBrief(page, "A recoverable connection failure");
  await page.goto("/desk");
  const card = cardFor(page, brief.title);
  let fail = true;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PATCH" && fail) {
      fail = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Simulated save interruption" }) });
    } else await route.continue();
  });
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve this brief?" });
  await dialog.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("has not been confirmed");
  await expect(card).toContainText("pending");
  await dialog.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("tab", { name: /Reviewed/ }).click();
  await expect(card).toContainText("Decision recorded");
});

test("confirmation keeps its original version and refuses a brief changed by another editor", async ({ page }) => {
  const brief = await createBrief(page, "A concurrently updated brief");
  await page.goto("/desk");
  const card = cardFor(page, brief.title);
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve this brief?" });
  await command(page, { action: "decide", id: brief.id, decision: { type: "edit", draft: "A different editor added important new context." }, version: 0 });
  await dialog.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/This brief changed while you were reviewing it/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirm approval", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card.locator("pre")).toContainText("different editor added");
  await expect(card).toContainText("pending");
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("tab", { name: /Reviewed/ }).click();
  await expect(card).toContainText("Decision recorded");
});

test("sign-out asks before discarding drafts and preserves them when sign-out fails", async ({ page }) => {
  const saved = await createBrief(page, "A saved brief survives sign-out");
  await page.goto("/desk");
  const title = page.getByLabel("Give it a title", { exact: true });
  await title.fill("An unfinished brief to protect");
  await page.getByLabel("Your brief", { exact: true }).fill("Keep these unsaved words until I choose to discard them.");
  let logoutPosts = 0;
  let failLogout = true;
  let nativeWarnings = 0;
  page.on("dialog", async (dialog) => { nativeWarnings++; await dialog.dismiss(); });
  await page.route("**/auth/logout", async (route) => {
    if (route.request().method() === "POST") {
      logoutPosts++;
      if (failLogout) {
        failLogout = false;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Simulated sign-out failure" }) });
        return;
      }
    }
    await route.continue();
  });
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await signOut.click();
  const confirmation = page.getByRole("dialog", { name: "Sign out with unfinished work?" });
  await expect(confirmation).toContainText("Your saved workspace records stay available");
  await expect(confirmation.getByRole("button", { name: "Keep working", exact: true })).toBeFocused();
  await confirmation.getByRole("button", { name: "Keep working", exact: true }).click();
  expect(logoutPosts).toBe(0);
  await expect(title).toHaveValue("An unfinished brief to protect");
  await expect(signOut).toBeFocused();
  await signOut.click();
  await confirmation.getByRole("button", { name: "Sign out and discard drafts", exact: true }).click();
  await expect(confirmation.getByRole("alert")).toContainText("unfinished work is still here");
  expect(logoutPosts).toBe(1);
  await confirmation.getByRole("button", { name: "Keep working", exact: true }).click();
  await expect(title).toHaveValue("An unfinished brief to protect");
  await signOut.click();
  await confirmation.getByRole("button", { name: "Sign out and discard drafts", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutPosts).toBe(2);
  expect(nativeWarnings).toBe(0);
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.goto("/desk");
  await expect(title).toHaveValue("");
  await expect(page.getByLabel("Your brief", { exact: true })).toHaveValue("");
  await expect(cardFor(page, saved.title)).toBeVisible();
});
