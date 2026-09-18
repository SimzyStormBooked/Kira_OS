import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ reducedMotion: "reduce" });

test("a shared welcome link opens signed out and leads to sign-in", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/welcome?for=cassy%40example.com");
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("a quiet place to work");
  await expect(page.getByText("cassy@example.com", { exact: false })).toBeVisible();

  // The link is honest about what it is not.
  await expect(page.getByText(/Your password is never in this link/)).toBeVisible();
  await expect(page.getByText(/does not create an account or grant access by itself/)).toBeVisible();

  const signIn = page.getByRole("link", { name: /Sign in to your workspace/ });
  await expect(signIn).toHaveAttribute("href", "/login?email=cassy%40example.com");

  // It reads on a phone, where a texted link is most likely to be opened.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(errors).toEqual([]);

  await signIn.click();
  await expect(page).toHaveURL(/\/login/);
});

test("a welcome link never reflects anything but a real address", async ({ page }) => {
  await page.goto("/welcome?for=Call+1-800-SCAM+now&next=https%3A%2F%2Fevil.example.com");
  await expect(page.getByText("1-800-SCAM")).toHaveCount(0);
  await expect(page.getByText(/Prepared for/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Sign in to your workspace/ })).toHaveAttribute("href", "/login");
});
