import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Mission Control shows honest data and sourced evidence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good afternoon, Cassandra." }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Demo metrics" })
      .getByText("DEMO", { exact: true }),
  ).toHaveCount(6);
  await expect(
    page.getByText("MANUAL SNAPSHOT", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show me why", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic reader-language sample" }),
  ).toBeVisible();
  await expect(
    page.getByText(/fabricated examples, not collected reader comments/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Behind the recommendation" }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("prepare → edit → teach → approve survives a reload", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prepare campaign", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Campaign brief prepared",
  );
  await page.goto("/desk");
  const card = page
    .locator(".approval-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Explore the devotion signal",
        exact: true,
      }),
    });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Campaign or review brief")
    .fill(
      "Cassandra approved direction: use only existing, verified marketing assets.",
    );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(card.locator("pre")).toContainText(
    "Cassandra approved direction",
  );
  await card.getByRole("button", { name: "Teach Raven", exact: true }).click();
  await page
    .getByLabel("What should Raven remember?")
    .fill("Readers must fit our audience. Reach alone is not success.");
  await page.getByRole("button", { name: "Save lesson", exact: true }).click();
  await expect(card).toContainText("Readers must fit our audience");
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Nothing has been published or sent",
  );
  await page.reload();
  await page.getByRole("tab", { name: /Reviewed/ }).click();
  await expect(card).toContainText("Decision recorded");
  await expect(card).toContainText("Cassandra approved direction");
  await expect(card).toContainText("Readers must fit our audience");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export decisions" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe(
    "kira-os-demo-workspace.json",
  );
});

test("reject, set aside and restore have real state transitions", async ({
  page,
}) => {
  await page.goto("/desk");
  await page
    .locator(".approval-card")
    .first()
    .getByRole("button", { name: "Reject", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm rejection", exact: true }).click();
  await page.getByRole("tab", { name: /Reviewed/ }).click();
  await expect(
    page.getByText("Rejected · Kept for audit history", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "Not today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Devotion has their attention." }),
  ).not.toBeVisible();
  await page.goto("/raven");
  await page.getByRole("button", { name: /Restore set-aside/ }).click();
  await expect(
    page.getByRole("heading", { name: "Devotion has their attention." }),
  ).toBeVisible();
});

test("Raven refresh crosses the API boundary and returns sourced demo recommendations", async ({
  page,
}) => {
  await page.goto("/raven");
  const result = page.waitForResponse(
    (r) => r.url().endsWith("/api/raven") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Refresh demo briefing" }).click();
  const response = await result;
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.run.status).toBe("completed");
  expect(data.run.provider).toBe("demo");
  expect(data.recommendations).toHaveLength(3);
  await expect(page.getByRole("status")).toContainText(
    "No live sources were queried",
  );
});

test("catalog search, filters, details and verification states work", async ({
  page,
}) => {
  await page.goto("/universe");
  await expect(page.locator(".book-card")).toHaveCount(8);
  await page
    .getByRole("button", { name: "My Alpha Team", exact: true })
    .click();
  await expect(page.locator(".book-card")).toHaveCount(3);
  await page.getByRole("button", { name: /All titles/ }).click();
  await page.getByLabel("Search catalog").fill("Assassin");
  await expect(page.locator(".book-card")).toHaveCount(3);
  await page.locator(".book-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Assassin’s Refusal", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Characters", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("NEEDS VERIFICATION");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Nothing has been inferred",
  );
  await page.getByRole("tab", { name: "Purchase Links", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Visit official collection" }),
  ).toHaveAttribute("href", "https://www.kirastanleyauthor.com/fantasy");
});

test("search and responsive navigation work without overflow", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search workspace" }).click();
  await page.getByLabel("Search books, briefs and pages").fill("Crazy People");
  await page.getByRole("link", { name: "Crazy People Book" }).click();
  await expect(
    page.getByRole("heading", { name: "Crazy People", exact: true }),
  ).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
  } else {
    await page.getByRole("link", { name: "Settings", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "The creative firewall" }),
  ).toBeVisible();
  await expect(page.getByText("Prohibited", { exact: true })).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("primary pages meet automated accessibility checks", async ({ page }) => {
  for (const route of ["/", "/universe", "/characters", "/desk", "/settings"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations,
      `${route}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, items: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
  }
});

test("all planned routes identify their boundaries and unknown URLs return 404", async ({
  page,
}) => {
  for (const route of [
    "/reader-pulse",
    "/social",
    "/discoverability",
    "/hunt",
    "/campaigns",
    "/outreach",
    "/vault",
  ]) {
    await page.goto(route);
    await expect(
      page.getByText(/This module is a roadmap preview/).filter({ visible: true }),
    ).toBeVisible();
  }
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This chapter isn’t here." }),
  ).toBeVisible();
});
