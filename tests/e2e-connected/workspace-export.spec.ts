import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { fixture } from "./fixture-data";

test.use({ reducedMotion: "reduce" });

async function signIn(page: import("@playwright/test").Page, email: string = fixture.memberEmail) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
});

test("the owner downloads a verified private archive with original manuscript bytes", async ({ page, request }) => {
  await signIn(page);
  const book = await page.evaluate(async () => (await (await fetch("/api/library")).json()).books[0] as { id: string });
  const original = "Synthetic permission-approved manuscript bytes for archive verification.";
  expect((await request.post(`${fixture.supabaseUrl}/__test/manuscripts`, { data: { bookId: book.id, text: original } })).ok()).toBe(true);
  await page.goto("/settings");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download workspace archive", exact: true }).click();
  const download = await downloadEvent;
  const saved = await download.path();
  expect(saved).toBeTruthy();
  const zip = await JSZip.loadAsync(await readFile(saved!));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as { format: string; total_records: number; point_in_time_backup: boolean; importable_restore: boolean; unavailable_files: unknown[] };
  expect(manifest).toMatchObject({ format: "kira-workspace-archive-v1", point_in_time_backup: false, importable_restore: false, unavailable_files: [] });
  expect(manifest.total_records).toBeGreaterThan(0);
  const manuscripts = JSON.parse(await zip.file("records/manuscripts.json")!.async("string")) as Array<{ id: string; book_id: string; filename: string }>;
  expect(manuscripts).toHaveLength(1);
  await expect(zip.file(`files/manuscripts/${manuscripts[0].book_id}/${manuscripts[0].id}.txt`)!.async("string")).resolves.toBe(original);
  await expect(page.getByRole("status").filter({ hasText: "Archive prepared for download" })).toBeVisible();
});

test("a viewer cannot see or call the owner archive", async ({ page, browser }) => {
  await signIn(page);
  expect(await page.evaluate(async email => (await fetch("/api/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", email, role: "viewer" }) })).status, fixture.outsiderEmail)).toBe(200);
  const context = await browser.newContext({ baseURL: fixture.appUrl });
  const viewer = await context.newPage();
  try {
    await signIn(viewer, fixture.outsiderEmail);
    await viewer.goto("/settings");
    await expect(viewer.getByRole("button", { name: "Download workspace archive", exact: true })).toHaveCount(0);
    expect(await viewer.evaluate(async () => (await fetch("/api/workspace/export")).status)).toBe(403);
  } finally { await context.close(); }
});
