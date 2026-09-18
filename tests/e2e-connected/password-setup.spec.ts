import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./fixture-data";

// Synthetic values for the loopback fixture only. No real account is changed.
const chosenPassword = "Synthetic-new-browser-password-only-6789!";

test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
});

async function submitPasswordSignIn(page: Page, password: string) {
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${fixture.appUrl}/login`);
}

test("a recent private-link sign-in can choose a password and return through the permanent login page", async ({ page, request }) => {
  await page.goto("/welcome#token_hash=fixture-welcome-member-token");
  await page.getByRole("button", { name: "Enter my workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.goto("/welcome");
  await expect(page.locator(".login-card")).toContainText(fixture.memberEmail);
  await page.getByRole("link", { name: "Set my password", exact: true }).click();
  await expect(page).toHaveURL(`${fixture.appUrl}/settings#account-password`);
  await expect(page.locator(".app-shell")).toBeVisible();
  const settings = page.locator("#account-password");
  await expect(settings.getByLabel("Current password", { exact: true })).toHaveCount(0);
  await settings.getByLabel("New password", { exact: true }).fill(chosenPassword);
  await settings.getByLabel("Confirm new password", { exact: true }).fill(chosenPassword);
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/password/setup" && response.request().method() === "POST");
  await settings.getByRole("button", { name: "Set my password", exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ changed: true });
  expect(response.headers()["cache-control"]).toContain("no-store");
  await expect(settings.getByRole("status")).toContainText("Your password is set. Next time, sign in with your email and this password.");
  await expect(settings.getByLabel("Current password", { exact: true })).toBeVisible();
  await expect(settings.getByRole("link", { name: "Open my workspace", exact: true })).toHaveAttribute("href", "/");
  await expect(settings.getByLabel("New password", { exact: true })).toHaveValue("");
  await expect(settings.getByLabel("Confirm new password", { exact: true })).toHaveValue("");

  await signOut(page);
  // The original fixture password must stop working after a genuine Auth update.
  await submitPasswordSignIn(page, fixture.password);
  await expect(page.locator("#login-error")).toContainText("Check your email and password");
  await submitPasswordSignIn(page, chosenPassword);
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.goto("/welcome");
  await expect(page.locator(".login-card")).toContainText(fixture.memberEmail);
  await page.getByRole("link", { name: "Continue to my workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(await page.evaluate(async () => {
    const workspace = await fetch("/api/workspace");
    return { status: workspace.status, role: workspace.headers.get("x-kira-workspace-role") };
  })).toEqual({ status: 200, role: "owner" });
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 1, consumedTokens: 1 });
});

test("a normal password sign-in still requires the current password and cannot use the private-link setup endpoint", async ({ page }) => {
  await page.goto("/login");
  await submitPasswordSignIn(page, fixture.password);
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.goto("/settings#account-password");
  const settings = page.locator("#account-password");
  await expect(settings.getByLabel("Current password", { exact: true })).toBeVisible();
  await expect(settings.getByLabel("Current password", { exact: true })).toHaveAttribute("required", "");
  await expect(settings.getByRole("button", { name: "Set my password", exact: true })).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Change my password", exact: true })).toBeVisible();
  const denied = await page.evaluate(async password => {
    const response = await fetch("/api/account/password/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: password, confirmPassword: password }),
    });
    return { status: response.status, body: await response.json() };
  }, chosenPassword);
  expect(denied.status).toBe(403);
  expect(denied.body.error).toContain("open a fresh sign-in link");
  await signOut(page);
  await submitPasswordSignIn(page, chosenPassword);
  await expect(page.locator("#login-error")).toContainText("Check your email and password");
  await submitPasswordSignIn(page, fixture.password);
  await expect(page.locator(".app-shell")).toBeVisible();
});
