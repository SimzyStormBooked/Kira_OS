import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });

async function signIn(page: Page, email: string = fixture.memberEmail) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}

const aiView = (available = false) => ({
  role: "owner",
  availability: { available, reason: available ? "ready" : "disabled", message: "Simulated setup status; no model is called." },
  generations: [], generation: null,
});

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await signIn(page);
});

test("owner setup changes from Meta configuration to consent and authorized status without making changes", async ({ page }) => {
  let configured = false;
  let authorized = false;
  const mutations: string[] = [];
  page.on("request", request => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) mutations.push(request.url());
  });
  await page.route("**/api/studio", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(aiView()) }));
  await page.route("**/api/connections/meta", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured, isOwner: true, connection: authorized ? { status: "authorized" } : null }) }));
  await page.goto("/settings#setup");
  const setup = page.locator("#setup").filter({visible:true});
  const meta = setup.locator('section[aria-labelledby="setup-meta-heading"]');
  await expect(setup).toHaveAttribute("aria-busy", "false");
  await expect(meta.locator(".status-pill")).toHaveText("SETUP NEEDED");
  await expect(meta).toContainText("Finish the Meta app setup");
  await expect(meta.getByRole("link", { name: /^Open Meta setup/ })).toHaveAttribute("href", "https://developers.facebook.com/apps/");
  await expect(setup.getByRole("link", { name: /^Open AI credit setup/ })).toHaveAttribute("href", "https://vercel.com/storm-booked/~/ai-gateway");
  await expect(meta.getByRole("link", { name: "Open Connections", exact: true })).toHaveAttribute("href", "/connections");

  configured = true;
  await setup.getByRole("button", { name: "Refresh connection status", exact: true }).click();
  await expect(meta.locator(".status-pill")).toHaveText("READY TO AUTHORIZE");
  await expect(meta).toContainText("The app setup is ready");
  await expect(meta).toContainText("You choose which accounts to share");
  await expect(meta.getByRole("link", { name: /^Open Meta setup/ })).toHaveCount(0);

  authorized = true;
  await setup.getByRole("button", { name: "Refresh connection status", exact: true }).click();
  await expect(meta.locator(".status-pill")).toHaveText("AUTHORIZED");
  await expect(meta).toContainText("Social analytics and automatic posting are not active");
  await expect(setup.getByRole("status")).toContainText("Refreshing does not connect accounts or purchase credits");
  expect(mutations).toEqual([]);
  expect(page.context().pages()).toHaveLength(1);
});

test("a failed AI status read can recover to ready through a read-only refresh", async ({ page }) => {
  let available = false;
  let studioReads = 0;
  const mutations: string[] = [];
  page.on("request", request => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) mutations.push(request.url());
  });
  await page.route("**/api/studio", route => {
    studioReads += 1;
    return route.fulfill({ status: available ? 200 : 503, contentType: "application/json", body: JSON.stringify(available ? aiView(true) : { error: "Simulated temporary connection outage." }) });
  });
  await page.route("**/api/connections/meta", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false, isOwner: true, connection: null }) }));
  await page.goto("/settings#setup");
  const setup = page.locator("#setup").filter({visible:true});
  const ai = setup.locator('section[aria-labelledby="setup-ai-heading"]');
  await expect(ai.locator(".status-pill")).toHaveText("CHECK AGAIN");
  await expect(ai).toContainText("The AI connection could not be confirmed");
  await expect(ai.getByRole("link", { name: "Build a blueprint now", exact: true })).toHaveAttribute("href", "/learn");

  available = true;
  await setup.getByRole("button", { name: "Refresh connection status", exact: true }).click();
  await expect(ai.locator(".status-pill")).toHaveText("READY");
  await expect(ai.getByRole("link", { name: "Ask Raven", exact: true })).toHaveAttribute("href", "/studio");
  await expect(ai.getByRole("link", { name: /^Open AI credit setup/ })).toHaveCount(0);
  await expect(ai.getByRole("link", { name: "Build a blueprint now", exact: true })).toHaveCount(0);
  expect(studioReads).toBeGreaterThanOrEqual(2);
  expect(mutations).toEqual([]);
});

for (const role of ["editor", "viewer"] as const) {
  test(`${role} setup offers usable internal links without owner account-setup links`, async ({ page, browser }) => {
    const granted = await page.evaluate(async ({ email, role }) => {
      const response = await fetch("/api/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", email, role }) });
      return response.status;
    }, { email: fixture.outsiderEmail, role });
    expect(granted).toBe(200);
    const collaboratorContext = await browser.newContext({ baseURL: fixture.appUrl, viewport: page.viewportSize()!, reducedMotion: "reduce" });
    try {
      const collaborator = await collaboratorContext.newPage();
      await collaborator.route("**/api/studio", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...aiView(), role }) }));
      await collaborator.route("**/api/connections/meta", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false, isOwner: false, connection: null }) }));
      await signIn(collaborator, fixture.outsiderEmail);
      await collaborator.goto("/settings#setup");
      const setup = collaborator.locator("#setup").filter({visible:true});
      await expect(setup).toHaveAttribute("aria-busy", "false");
      await expect(setup).toContainText("Your workspace owner is finishing the AI connection");
      await expect(setup).toContainText("Your workspace owner manages social authorization");
      await expect(setup.getByRole("link", { name: /^Open AI credit setup/ })).toHaveCount(0);
      await expect(setup.getByRole("link", { name: /^Open Meta setup/ })).toHaveCount(0);
      await expect(setup.locator('a[target="_blank"]')).toHaveCount(0);
      await expect(setup.getByRole("link", { name: "Build a blueprint now", exact: true })).toHaveAttribute("href", "/learn");
      await expect(setup.getByRole("link", { name: "Open Connections", exact: true })).toHaveAttribute("href", "/connections");
    } finally { await collaboratorContext.close(); }
  });
}

test("setup auth failure rechecks the real session and clears drafts before redirecting", async ({ page, context }) => {
  let sessionEnded = false;
  let workspaceReads = 0;
  const dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/workspace" && request.method() === "GET") workspaceReads += 1;
  });
  await page.route("**/api/studio", route => route.fulfill({ status: sessionEnded ? 401 : 200, contentType: "application/json", body: JSON.stringify(sessionEnded ? { error: "Simulated expired status session." } : aiView()) }));
  await page.route("**/api/connections/meta", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false, isOwner: true, connection: null }) }));
  await page.goto("/learn");
  await page.getByLabel("Give your idea a name", { exact: true }).fill("Private setup-session draft must be cleared");
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('a.nav-item[href="/settings"]:visible').first().click();
  const refresh = page.locator("#setup").filter({visible:true}).getByRole("button", { name: "Refresh connection status", exact: true });
  await expect(refresh).toBeEnabled();
  const readsBeforeExpiry = workspaceReads;
  await context.clearCookies();
  sessionEnded = true;
  await refresh.click();
  await expect(page).toHaveURL(/\/login$/);
  expect(workspaceReads).toBeGreaterThan(readsBeforeExpiry);
  expect(dialogs).toEqual([]);
  await page.unroute("**/api/studio");
  await page.unroute("**/api/connections/meta");
  await signIn(page);
  await page.goto("/learn");
  await expect(page.getByLabel("Give your idea a name", { exact: true })).toHaveValue("My business brainstorm partner");
});
