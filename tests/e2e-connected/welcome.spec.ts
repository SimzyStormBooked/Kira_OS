import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./fixture-data";

const memberToken = "fixture-welcome-member-token";
const outsiderToken = "fixture-welcome-outsider-token";
const welcomeLink = (token: string) => `/welcome#token_hash=${token}`;

test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
});

async function openWelcome(page: Page, token: string) {
  await page.goto(welcomeLink(token));
  await expect(page.getByRole("button", { name: "Enter my workspace", exact: true })).toBeEnabled();
  await expect(page).toHaveURL(`${fixture.appUrl}/welcome`);
}

async function enterWelcome(page: Page, expectedStatus = 200) {
  const verification = page.waitForResponse(response => new URL(response.url()).pathname === "/auth/welcome" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Enter my workspace", exact: true }).click();
  const response = await verification;
  expect(response.status()).toBe(expectedStatus);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  return response;
}

// Browser fetch uses the same Secure cookie handling as the real loopback UI;
// APIRequestContext does not send those cookies over the fixture's HTTP origin.
async function readWorkspace(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/workspace");
    return { status: response.status, role: response.headers.get("x-kira-workspace-role") };
  });
}

test("welcome scrubs the private fragment and waits for a click before creating a real owner session", async ({ page, context, request }) => {
  const requests: { method: string; url: string; referer: string }[] = [];
  page.on("request", current => requests.push({ method: current.method(), url: current.url(), referer: current.headers().referer ?? "" }));
  await openWelcome(page, memberToken);
  await expect(page.getByRole("heading", { name: "Your space is waiting." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(token => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(token), memberToken)).toBe(false);
  expect(requests.filter(current => current.method === "POST")).toEqual([]);
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 0, consumedTokens: 0 });

  // A scanner or preview fetching the verification endpoint cannot consume it.
  expect((await request.get("/auth/welcome")).status()).toBe(405);
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 0, consumedTokens: 0 });
  expect((await readWorkspace(page)).status).toBe(401);

  await enterWelcome(page);
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page).toHaveURL(`${fixture.appUrl}/`);
  const authCookies = (await context.cookies()).filter(cookie => cookie.name.includes("auth-token"));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every(cookie => cookie.httpOnly && cookie.secure && cookie.sameSite === "Lax")).toBe(true);
  expect(await readWorkspace(page)).toEqual({ status: 200, role: "owner" });
  expect(await page.evaluate(async () => (await fetch("/api/access")).json())).toMatchObject({ role: "owner", owner: { userId: fixture.memberId } });
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(requests.filter(current => current.method === "POST" && new URL(current.url).pathname === "/auth/welcome")).toHaveLength(1);
  expect(requests.some(current => current.url.includes(memberToken) || current.referer.includes(memberToken))).toBe(false);
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 1, consumedTokens: 1 });
});

test("a consumed welcome link cannot open a second session after sign-out", async ({ page, context, request }) => {
  await openWelcome(page, memberToken);
  await enterWelcome(page);
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${fixture.appUrl}/login`);
  await openWelcome(page, memberToken);
  await enterWelcome(page, 401);
  await expect(page.locator(".login-form").getByRole("alert")).toContainText("expired or already been used");
  await expect(page.locator(".login-form").getByRole("alert")).toBeFocused();
  await expect(page.getByRole("button", { name: "Enter my workspace", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in with email and password" })).toHaveAttribute("href", "/login");
  expect((await context.cookies()).some(cookie => cookie.name.includes("auth-token") && cookie.value)).toBe(false);
  expect((await readWorkspace(page)).status).toBe(401);
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 2, consumedTokens: 1 });
});

test("a valid link for an account without workspace membership fails closed and removes its session", async ({ page, context, request }) => {
  await openWelcome(page, outsiderToken);
  await enterWelcome(page, 403);
  await expect(page.locator(".login-form").getByRole("alert")).toContainText("fresh link and access");
  await expect(page.locator(".app-shell")).toHaveCount(0);
  expect((await context.cookies()).some(cookie => cookie.name.includes("auth-token") && cookie.value)).toBe(false);
  expect((await readWorkspace(page)).status).toBe(401);
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 1, consumedTokens: 1 });
  await page.goto("/desk");
  await expect(page).toHaveURL(`${fixture.appUrl}/login`);
});

test("a welcome link respects an existing viewer membership instead of granting owner access", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  const granted = await page.evaluate(async email => (await fetch("/api/access", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "grant", email, role: "viewer" }),
  })).status, fixture.outsiderEmail);
  expect(granted).toBe(200);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${fixture.appUrl}/login`);

  await openWelcome(page, outsiderToken);
  await enterWelcome(page);
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(await readWorkspace(page)).toEqual({ status: 200, role: "viewer" });
  expect(await page.evaluate(async () => (await fetch("/api/access")).json())).toEqual({ role: "viewer", owner: null, members: [] });
  expect(await page.evaluate(async () => (await fetch("/api/workspace", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", title: "Forbidden viewer draft", draft: "This link must not elevate my permissions." }),
  })).status)).toBe(403);
});

test("a missing or malformed fragment offers a clear password fallback without verification", async ({ page, request }) => {
  for (const path of ["/welcome", "/welcome#token_hash=too-short", `/welcome?token_hash=${memberToken}`]) {
    await page.goto(path);
    await expect(page.locator(".login-form").getByRole("status")).toContainText("Open the full private link");
    await expect(page.getByRole("button", { name: "Enter my workspace", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(`${fixture.appUrl}/welcome`);
  }
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 0, consumedTokens: 0 });
  await page.getByRole("link", { name: "Sign in with email and password" }).click();
  await expect(page).toHaveURL(`${fixture.appUrl}/login`);
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("refreshing a scrubbed welcome page explains how to reopen the unused original link", async ({ page, request }) => {
  await openWelcome(page, memberToken);
  await page.reload();
  await expect(page.locator(".login-form").getByRole("status")).toContainText("reopen that original link");
  await expect(page.getByRole("button", { name: "Enter my workspace", exact: true })).toHaveCount(0);
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 0, consumedTokens: 0 });
  await openWelcome(page, memberToken);
  await enterWelcome(page);
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("a consumed-link failure asks for a fresh link and does not offer a misleading retry", async ({ page, request }) => {
  await page.route("**/auth/welcome", route => route.fulfill({
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    body: JSON.stringify({ code: "link_consumed", error: "Simulated access lookup failure after verification." }),
  }));
  await openWelcome(page, memberToken);
  await enterWelcome(page, 503);
  const form = page.locator(".login-form");
  await expect(form.getByRole("alert")).toContainText("Your sign-in link was used");
  await expect(form.getByRole("alert")).toContainText("Ask your workspace owner for a fresh link");
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(form.getByRole("button", { name: "Enter my workspace", exact: true })).toHaveCount(0);
  await expect(form.getByRole("link", { name: "Sign in with email and password" })).toHaveAttribute("href", "/login");
  await expect(page.locator(".app-shell")).toHaveCount(0);
  expect((await readWorkspace(page)).status).toBe(401);
  // Only the UI response is simulated; no fixture or live token was consumed.
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 0, consumedTokens: 0 });
});

test("a temporary failure retains the same private link and an explicit retry opens the workspace", async ({ page, request }) => {
  await page.route("**/auth/welcome", route => route.fulfill({
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    body: JSON.stringify({ error: "Simulated provider unavailable before verification." }),
  }));
  await openWelcome(page, memberToken);
  await enterWelcome(page, 503);
  const form = page.locator(".login-form");
  await expect(form.getByRole("alert")).toContainText("Your link is still held in this tab; please try again");
  await expect(form.getByRole("button", { name: "Enter my workspace", exact: true })).toBeEnabled();
  await expect(page).toHaveURL(`${fixture.appUrl}/welcome`);
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 0, consumedTokens: 0 });

  await page.unroute("**/auth/welcome");
  // Retry the retained fragment from this page, through the real app/Auth boundary.
  await enterWelcome(page);
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(await readWorkspace(page)).toEqual({ status: 200, role: "owner" });
  expect(await (await request.get(`${fixture.supabaseUrl}/__test/welcome`)).json()).toEqual({ verificationRequests: 1, consumedTokens: 1 });
});
