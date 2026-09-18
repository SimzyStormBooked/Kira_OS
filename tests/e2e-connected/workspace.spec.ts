import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";

async function signIn(page: Page, email: string = fixture.memberEmail, password: string = fixture.password) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${fixture.supabaseUrl}/__test/reset`);
  expect(reset.ok()).toBe(true);
});

test("private pages and API reject unauthenticated and nonmember access", async ({ page, request }) => {
  await page.goto("/desk");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Your private workspace." })).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  const unauthorized = await request.get("/api/workspace");
  expect(unauthorized.status()).toBe(401);
  expect(unauthorized.headers()["cache-control"]).toContain("no-store");

  await signIn(page, fixture.memberEmail, "incorrect-test-password");
  await expect(page.locator("#login-error")).toContainText("Check your email and password");
  await signIn(page, fixture.outsiderEmail);
  await expect(page.locator("#login-error")).toContainText("does not have access");
  await page.goto("/desk");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign in → create → edit → teach → approve persists through reload and sign-out", async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Welcome home, Cassandra." })).toBeVisible();
  await expect(page.getByText("Private workspace · Saved securely in Supabase")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("connected-home.png"), fullPage: true });
  const authCookies = (await context.cookies()).filter((cookie) => cookie.name.includes("auth-token"));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((cookie) => cookie.httpOnly && cookie.secure && cookie.sameSite === "Lax")).toBe(true);
  await expect(page.getByRole("region", { name: "Demo metrics" })).toHaveCount(0);
  await page.getByRole("link", { name: "Add a business brief" }).click();
  await page.getByLabel("Give it a title").fill("Simulated autumn campaign brief");
  await page.getByLabel("Your brief", { exact: true }).fill("Use only approved book descriptions for our autumn reading-list promotion.");
  await page.getByRole("button", { name: "Save for review" }).click();
  const card = page.locator(".approval-card").filter({ has: page.getByRole("heading", { name: "Simulated autumn campaign brief", exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Campaign or review brief").fill("Edited simulated brief: Cassandra verifies each title before any promotion.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(card.locator("pre")).toContainText("Cassandra verifies each title");
  await card.getByRole("button", { name: "Teach Raven", exact: true }).click();
  await page.getByLabel("What should Raven remember?").fill("A suitable audience matters more than broad reach. Simulated browser lesson.");
  await page.getByRole("button", { name: "Save lesson", exact: true }).click();
  await expect(card).toContainText("A suitable audience matters more");
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Nothing has been published or sent");
  await page.reload();
  await page.getByRole("tab", { name: /Reviewed/ }).click();
  await expect(card).toContainText("Decision recorded");
  await expect(card).toContainText("Cassandra verifies each title");
  await expect(card).toContainText("A suitable audience matters more");

  const data = await page.evaluate(async () => (await fetch("/api/workspace")).json());
  expect(data.approvals).toHaveLength(1);
  expect(data.approvals[0]).toMatchObject({ status: "approved", data_origin: "manual", version: 2 });
  expect(data.feedback[0]).toMatchObject({ scope: "author_workspace", user_id: fixture.memberId });
  expect(await page.evaluate(() => localStorage.getItem("kira-os:phase-one:v1"))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export decisions" }).click();
  expect((await download).suggestedFilename()).toBe("kira-os-workspace.json");

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${fixture.appUrl}/login`);
  await page.goto("/desk");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".approval-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("sign-out in another tab clears the old private view when it regains focus", async ({ page, context }) => {
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Welcome home, Cassandra." })).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  await otherTab.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(otherTab).toHaveURL(`${fixture.appUrl}/login`);
  await page.bringToFront();
  // Headless Chromium does not dispatch OS window-focus events when switching its tabs.
  // Trigger that browser event explicitly; the real refresh request and auth denial remain unchanged.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(`${fixture.appUrl}/login`);
  await expect(page.locator(".app-shell")).toHaveCount(0);
});

test("login and private home are accessible and fit the viewport", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
  for (const view of ["login", "private home"]) {
    if (view === "private home") {
      await signIn(page);
      await expect(page.getByRole("heading", { name: "Welcome home, Cassandra." })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${view} horizontal overflow`).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations, `${view}: ${JSON.stringify(result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })))}`).toEqual([]);
  }
});
