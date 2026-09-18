import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });
async function login(page: Page, email: string) {
  await page.goto(`${fixture.appUrl}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await login(page, fixture.memberEmail);
});

test("learning builds a local blueprint, preserves recipe notes, and saves only on request", async ({ page }) => {
  await page.goto("/learn");
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && ["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url());
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByText("Five quick lessons, when you need them", { exact: true }).click();
  const lesson = page.locator("details.learn-lesson").filter({ hasText: "Give it a clear job and some context" });
  await lesson.locator("summary").focus();
  await lesson.locator("summary").press("Enter");
  await expect(lesson).toHaveAttribute("open", "");
  const name = page.getByLabel("Give your idea a name", { exact: true });
  await name.fill("A launch thinking partner for Michael");
  await page.getByLabel("What should it help you do?", { exact: true }).fill("Compare practical ways to support one approved book launch.");
  await page.getByRole("radio", { name: /^Reader listening partner/ }).check();
  await expect(name).toHaveValue("My reader listening partner");
  await page.getByRole("radio", { name: /^Business brainstorm partner/ }).check();
  await expect(name).toHaveValue("A launch thinking partner for Michael");
  await page.getByRole("button", { name: "Start an idea for Michael", exact: true }).click();
  const replacement = page.getByRole("region", { name: "Keep your workshop notes" });
  await expect(replacement).toBeVisible();
  await replacement.getByRole("button", { name: "Keep my notes", exact: true }).click();
  await expect(name).toHaveValue("A launch thinking partner for Michael");
  await page.getByRole("button", { name: "Build my blueprint", exact: true }).click();
  const prompt = page.getByLabel("Prompt to copy or adapt", { exact: true });
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue(/Do not write or rewrite fiction/);
  await expect(page.getByText("Assembled from your notes · No agent running", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download blueprint", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("kira-agent-blueprint.txt");
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Save blueprint to my desk", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved to my desk", exact: true })).toBeDisabled();
  const deskLink = page.getByRole("link", { name: "Open my saved blueprint at the desk" });
  await expect(deskLink).toBeFocused();
  expect(writes).toHaveLength(1);
  expect(new URL(writes[0]).pathname).toBe("/api/workspace");
  await deskLink.click();
  await expect(page.getByRole("heading", { name: "A launch thinking partner for Michael · Agent blueprint", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".approval-card")).toContainText("AGENT BLUEPRINT · MANUAL PLANNING DOCUMENT");
});

test("owner grants, changes and revokes access while viewer controls stay read-only", async ({ page, browser }) => {
  await page.evaluate(async () => {
    const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", title: "A shared brief for collaborator review", draft: "This saved idea is available for authorized collaborators to read." }) });
    if (!response.ok) throw new Error("Could not create simulated collaboration brief");
  });
  await page.goto("/access");
  await expect(page.getByText("Your role: owner", { exact: true })).toBeVisible();
  await expect(page.getByText(/A shared link alone does not grant access/)).toBeVisible();
  await page.getByLabel("Their account email", { exact: true }).fill(fixture.outsiderEmail);
  await expect(page.getByLabel("Permission", { exact: true })).toHaveValue("viewer");
  await page.getByRole("button", { name: "Grant access", exact: true }).click();
  await expect(page.getByText("Access saved. No invitation or email was sent.", { exact: true })).toBeVisible();
  await page.reload();
  const member = page.locator(".access-member").filter({ has: page.getByText(fixture.outsiderEmail, { exact: true }) });
  await expect(member).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const collaboratorContext = await browser.newContext({ baseURL: fixture.appUrl, viewport: page.viewportSize()!, reducedMotion: "reduce" });
  try {
    const collaborator = await collaboratorContext.newPage();
    await login(collaborator, fixture.outsiderEmail);
    await collaborator.goto("/access");
    await expect(collaborator.getByText("Your role: viewer", { exact: true })).toBeVisible();
    await expect(collaborator.getByRole("button", { name: "Grant access", exact: true })).toHaveCount(0);
    await expect(collaborator.getByText(fixture.memberEmail, { exact: true })).toHaveCount(0);
    expect(await collaborator.evaluate(async () => (await fetch("/api/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", email: "unauthorized@example.test", role: "editor" }) })).status)).toBe(403);
    await collaborator.goto("/desk");
    const title = collaborator.getByLabel("Give it a title", { exact: true });
    const save = collaborator.getByRole("button", { name: "Save for review", exact: true });
    await expect(save).toBeDisabled();
    for (const label of ["Approve", "Edit", "Reject", "Teach Raven"]) await expect(collaborator.getByRole("button", { name: label, exact: true })).toBeDisabled();
    await expect(collaborator.getByRole("button", { name: "Evidence", exact: true })).toBeEnabled();
    expect(await collaborator.evaluate(async () => (await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", title: "Forbidden", draft: "A viewer cannot write this." }) })).status)).toBe(403);
    await collaborator.goto("/learn");
    await collaborator.getByRole("button", { name: "Build my blueprint", exact: true }).click();
    await expect(collaborator.getByRole("button", { name: "Save blueprint to my desk", exact: true })).toBeDisabled();
    await expect(collaborator.getByRole("button", { name: "Download blueprint", exact: true })).toBeEnabled();
    await collaborator.goto("/desk");

    await member.getByRole("combobox").selectOption("editor");
    await member.getByRole("button", { name: "Save role", exact: true }).click();
    await expect(member.getByRole("button", { name: "Save role", exact: true })).toBeDisabled();
    await collaborator.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(save).toBeEnabled();
    await title.fill("A draft preserved through role changes");
    await member.getByRole("combobox").selectOption("viewer");
    await member.getByRole("button", { name: "Save role", exact: true }).click();
    await expect(member.getByRole("button", { name: "Save role", exact: true })).toBeDisabled();
    await collaborator.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(save).toBeDisabled();
    await expect(title).toHaveValue("A draft preserved through role changes");

    await member.getByRole("button", { name: "Remove access", exact: true }).click();
    const removal = page.getByRole("dialog", { name: "Remove workspace access?" });
    await expect(removal).toContainText("saved briefs, decisions, and lessons stay in place");
    await removal.getByRole("button", { name: "Remove access", exact: true }).click();
    await expect(removal).not.toBeVisible();
    await expect(member).toHaveCount(0);
    await expect(page.getByText("Workspace access removed. Their saved work is retained.", { exact: true })).toBeFocused();
    await collaborator.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(collaborator).toHaveURL(/\/login$/);
    const state = await page.evaluate(async () => (await fetch("/api/workspace")).json());
    expect(state.approvals).toHaveLength(1);
  } finally { await collaboratorContext.close(); }
});

test("the password form clears credentials after a successful simulated response", async ({ page }) => {
  await page.goto("/settings");
  // API authentication and updateUser are covered by account-password.test.ts.
  // This response is deliberately simulated; no account password changes here.
  await page.route("**/api/account/password", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ changed: true }) }));
  const current = page.getByLabel("Current password", { exact: true });
  const next = page.getByLabel("New password", { exact: true });
  const confirmation = page.getByLabel("Confirm new password", { exact: true });
  await current.fill("Synthetic-current-password-only");
  await next.fill("Synthetic-new-password-only");
  await confirmation.fill("Synthetic-new-password-only");
  await page.getByRole("button", { name: "Change my password", exact: true }).click();
  for (const field of [current, next, confirmation]) await expect(field).toHaveValue("");
  await expect(page.getByText("Your password has been changed. Use your new password next time you sign in.", { exact: true })).toBeFocused();
  expect(await page.evaluate(() => Object.values(localStorage).some((value) => String(value).includes("Synthetic-new-password-only")))).toBe(false);
});

test("permission refresh failures pause saves without losing notes or mislabeling the role", async ({ page }) => {
  await page.goto("/desk");
  const title = page.getByLabel("Give it a title", { exact: true });
  const save = page.getByRole("button", { name: "Save for review", exact: true });
  await title.fill("Keep this unfinished business idea");
  await page.route("**/api/workspace", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The simulated connection is unavailable." }) }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const retry = page.getByRole("button", { name: "Check permissions again", exact: true });
  await expect(retry).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(title).toHaveValue("Keep this unfinished business idea");
  await expect(page.getByText(/You have viewer access/)).toHaveCount(0);
  await page.unroute("**/api/workspace");
  // Even a valid private response cannot enable writes without its verified role.
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    delete headers["x-kira-workspace-role"];
    await route.fulfill({ response, headers });
  });
  await retry.click();
  await expect(retry).toBeEnabled();
  await expect(save).toBeDisabled();
  await expect(title).toHaveValue("Keep this unfinished business idea");
  await page.unroute("**/api/workspace");
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(save).toBeEnabled();
  await expect(title).toHaveValue("Keep this unfinished business idea");
  await expect(page.locator("#main-content")).toBeFocused();
});
