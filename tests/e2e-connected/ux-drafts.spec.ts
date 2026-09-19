import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./fixture-data";
import { STUDIO_MODEL, type StudioGeneration } from "@/lib/ai/studio-contract";

test.use({ reducedMotion: "reduce" });
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
async function navigate(page: Page, href: string) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible() && await menu.getAttribute("aria-expanded") !== "true") await menu.click();
  await page.locator(`a.nav-item[href="${href}"]:visible`).first().click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href);
}
const readyView = { role: "owner", availability: { available: true, reason: "ready", message: "Simulated AI availability for browser testing; no model is called." }, generations: [], generation: null };
test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await login(page);
});

test("workshop fields, recipe previews and explicit saved state survive Desk navigation", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/") && ["POST", "PATCH"].includes(request.method())) mutations.push(request.url()); });
  await navigate(page, "/learn");
  const jump = page.getByRole("button", { name: "Start my blueprint", exact: true });
  await jump.focus(); await jump.press("Enter");
  const name = page.getByLabel("Give your idea a name", { exact: true });
  await expect(name).toBeFocused();
  await expect(page.locator(".learn-lessons-panel")).not.toHaveAttribute("open", "");
  await name.fill("My private workshop marker");
  await page.getByLabel("What should it help you do?", { exact: true }).fill("Compare a manageable promotion using approved book details.");
  await page.getByLabel("What should it know first? Optional", { exact: true }).fill("Private working context that must stay out of browser storage.");
  await page.getByLabel("What would a useful result look like?", { exact: true }).fill("Three choices with effort and next steps.");
  await page.getByRole("button", { name: "Build my blueprint", exact: true }).click();
  const built = await page.getByLabel("Prompt to copy or adapt", { exact: true }).inputValue();
  if ((page.viewportSize()?.width ?? 1440) <= 760) {
    const smallFields = await page.locator('input:not([type="radio"]):not([type="checkbox"]), textarea, select').evaluateAll(fields => fields.filter(field => field.getClientRects().length > 0 && parseFloat(getComputedStyle(field).fontSize) < 16).map(field => field.id));
    expect(smallFields, "Mobile workshop controls stay readable without input zoom").toEqual([]);
  }
  await page.getByRole("radio", { name: /^Reader listening partner/ }).check();
  await name.fill("My second recipe marker");
  await page.getByRole("button", { name: "Build my blueprint", exact: true }).click();
  await navigate(page, "/desk");
  await navigate(page, "/learn");
  await expect(name).toHaveValue("My second recipe marker");
  await expect(page.getByLabel("Prompt to copy or adapt", { exact: true })).toHaveValue(/My second recipe marker/);
  await page.getByRole("radio", { name: /^Business brainstorm partner/ }).check();
  await expect(name).toHaveValue("My private workshop marker");
  await expect(page.getByLabel("What should it know first? Optional", { exact: true })).toHaveValue("Private working context that must stay out of browser storage.");
  await expect(page.getByLabel("Prompt to copy or adapt", { exact: true })).toHaveValue(built);
  expect(mutations).toEqual([]);
  expect(await page.evaluate(() => [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => String(value).includes("private workshop marker"))))).toBe(false);
  await page.getByRole("button", { name: "Save blueprint to my desk", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved to my desk", exact: true })).toBeDisabled();
  await navigate(page, "/desk"); await navigate(page, "/learn");
  await expect(page.getByRole("button", { name: "Saved to my desk", exact: true })).toBeDisabled();
  expect(mutations).toHaveLength(1);
  await navigate(page, "/desk");
  // Another recipe is still unfinished; refresh warns even while away from Learn.
  const dialogEvent = page.waitForEvent("dialog");
  await page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
  const dialog = await dialogEvent;
  expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss();
  await expect(page).toHaveURL(/\/desk$/);
  await navigate(page, "/learn");
  await expect(name).toHaveValue("My private workshop marker");
});

test("unsent Studio questions survive navigation and are preserved if AI becomes unavailable", async ({ page }) => {
  let available = true;
  const writes: string[] = [];
  await page.route("**/api/studio*", route => {
    if (route.request().method() !== "GET") { writes.push(route.request().method()); return route.abort(); }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...readyView, availability: available ? readyView.availability : { available: false, reason: "disabled", message: "Ask Raven is waiting for workspace setup." } }) });
  });
  await navigate(page, "/studio");
  await page.getByLabel("What would help today?", { exact: true }).selectOption("learning");
  const prompt = "Private question: help me compare business options without making up book facts.";
  await page.getByLabel("Your question and useful context", { exact: true }).fill(prompt);
  await navigate(page, "/desk"); await navigate(page, "/studio");
  await expect(page.getByLabel("Your question and useful context", { exact: true })).toHaveValue(prompt);
  await expect(page.getByLabel("What would help today?", { exact: true })).toHaveValue("learning");
  available = false;
  await page.getByRole("button", { name: "Refresh history", exact: true }).click();
  await expect(page.getByLabel("Your question and useful context", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your preserved question", { exact: true })).toHaveValue(prompt);
  await expect(page.getByLabel("Your preserved question", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("link", { name: "Explore Learn & Create", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Finish workspace setup", exact: true })).toHaveAttribute("href", "/settings#setup");
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => String(value).includes("Private question:"))))).toBe(false);
});

test("session loss clears every private scratchpad without preventing sign-out", async ({ page, context }) => {
  await page.route("**/api/studio*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(readyView) }));
  await navigate(page, "/learn");
  await page.getByLabel("Give your idea a name", { exact: true }).fill("Must disappear after session loss");
  await navigate(page, "/studio");
  await page.getByLabel("Your question and useful context", { exact: true }).fill("Private unsent question must disappear after session loss.");
  await navigate(page, "/desk");
  await page.getByLabel("Give it a title", { exact: true }).fill("Private unfinished idea must disappear");
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  await otherTab.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(otherTab).toHaveURL(/\/login$/);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await navigate(page, "/learn");
  await expect(page.getByLabel("Give your idea a name", { exact: true })).toHaveValue("My business brainstorm partner");
  await navigate(page, "/studio");
  await expect(page.getByLabel("Your question and useful context", { exact: true })).toHaveValue("");
  await navigate(page, "/desk");
  await expect(page.getByLabel("Give it a title", { exact: true })).toHaveValue("");
  await otherTab.close();
});

test("a completed answer saves an attributed review brief only on request and avoids repeat saves", async ({ page }) => {
  const generation: StudioGeneration = { knowledge_context:{book_ids:[],include_spoilers:false,evidence:[]},
    id: "11111111-1111-4111-8111-111111111111", author_id: fixture.authorId, created_by: fixture.memberId,
    job: "brainstorm", prompt: "Compare a small business idea for a book using verified information.", model: STUDIO_MODEL,
    status: "complete", result: { kind: "ideas", title: "One manageable next step", summary: "Start with an approved description.", options: [{ title: "Review existing copy", idea: "Read the current approved description.", tradeoff: "It takes a small amount of your time.", first_step: "Find the approved source.", verify: ["Confirm permission and source date."] }], questions: [], context_used: [] },
    input_tokens: 100, output_tokens: 150, estimated_cost_usd: 0.001, gateway_generation_id: null, error_code: null, created_at: "2026-09-18T00:00:00Z", completed_at: "2026-09-18T00:00:01Z",
  };
  let writes = 0;
  page.on("request", request => { if (request.url().includes("/api/workspace") && request.method() === "PATCH") writes++; });
  await page.route("**/api/studio*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...readyView, generations: [generation], generation }) }));
  await page.goto(`/studio/${generation.id}`);
  await expect(page.getByRole("heading", { name: generation.result!.title, exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Save answer to my desk", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved to my desk", exact: true })).toBeDisabled();
  expect(writes).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Saved to my desk", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Review at my desk", exact: true }).click();
  const brief = page.locator(".approval-card").filter({ has: page.getByRole("heading", { name: "One manageable next step · Raven answer", exact: true }) });
  await expect(brief).toContainText("AI-generated answer was explicitly copied");
  await expect(brief).toContainText(`Source answer: /studio/${generation.id}`);
  expect(writes).toBe(1);
});

function simulatedAnswer(id: string, prompt: string): StudioGeneration {
  return {
    knowledge_context:{book_ids:[],include_spoilers:false,evidence:[]},
    id, author_id: fixture.authorId, created_by: fixture.memberId, job: "brainstorm", prompt, model: STUDIO_MODEL,
    status: "complete", result: { kind: "ideas", title: "A simulated saved answer", summary: "A browser-test answer; no provider was called.", options: [{ title: "A small first step", idea: "Review approved information.", tradeoff: "It takes some attention.", first_step: "Find the approved source.", verify: [] }], questions: [], context_used: [] },
    input_tokens: 10, output_tokens: 10, estimated_cost_usd: null, gateway_generation_id: null, error_code: null,
    created_at: "2026-09-18T00:00:00Z", completed_at: "2026-09-18T00:00:01Z",
  };
}

test("ordinary navigation retains retry identity, explicit new questions get a fresh identity, and unfinished questions are protected", async ({ page }) => {
  const saved = new Map<string, StudioGeneration>();
  const submitted: string[] = [];
  await page.route("**/api/studio*", async route => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON() as { id: string; prompt: string };
      submitted.push(input.id);
      const generation = saved.get(input.id) ?? simulatedAnswer(input.id, input.prompt);
      saved.set(input.id, generation);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generation }) });
    }
    const id = new URL(route.request().url()).searchParams.get("id");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...readyView, generations: [...saved.values()], generation: id ? saved.get(id) ?? null : null }) });
  });
  const question = "Help me compare a manageable business idea with verified facts.";
  await navigate(page, "/studio");
  await page.getByLabel("Your question and useful context", { exact: true }).fill(question);
  await page.getByRole("button", { name: "Ask Raven", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/[0-9a-f-]{36}$/);
  const firstId = submitted[0];
  await navigate(page, "/desk"); await navigate(page, "/studio");
  await expect(page.getByLabel("Your question and useful context", { exact: true })).toHaveValue(question);
  await page.getByRole("button", { name: "Ask Raven", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/${firstId}$`));
  expect(submitted).toEqual([firstId, firstId]);
  await page.getByRole("button", { name: "Ask a new question", exact: true }).click();
  await expect(page.getByLabel("Your question and useful context", { exact: true })).toHaveValue("");
  await page.getByLabel("Your question and useful context", { exact: true }).fill(question);
  await page.getByRole("button", { name: "Ask Raven", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/[0-9a-f-]{36}$/);
  expect(submitted[2]).not.toBe(firstId);
  await navigate(page, "/studio");
  await page.getByLabel("Your question and useful context", { exact: true }).fill("An unfinished different question that I want to keep.");
  await page.locator(`.studio-history a[href="/studio/${firstId}"]`).click();
  await page.getByRole("button", { name: "Ask a new question", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Keep your unfinished question?" });
  await expect(confirmation.getByRole("button", { name: "Keep my question", exact: true })).toBeFocused();
  await confirmation.getByRole("button", { name: "Keep my question", exact: true }).click();
  await expect(page.getByLabel("Your question and useful context", { exact: true })).toHaveValue("An unfinished different question that I want to keep.");
  expect(submitted).toHaveLength(3);
});

test("a delayed answer finishes without dragging the author away from another page", async ({ page }) => {
  let generation: StudioGeneration | null = null;
  let finishRequest!: () => void;
  const release = new Promise<void>(resolve => { finishRequest = resolve; });
  await page.route("**/api/studio*", async route => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON() as { id: string; prompt: string };
      await release;
      generation = simulatedAnswer(input.id, input.prompt);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generation }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...readyView, generations: generation ? [generation] : [], generation: null }) });
  });
  await navigate(page, "/studio");
  await page.getByLabel("Your question and useful context", { exact: true }).fill("A business question that takes a little time to consider.");
  await page.getByRole("button", { name: "Ask Raven", exact: true }).click();
  await expect(page.getByRole("button", { name: "Raven is thinking…", exact: true })).toBeDisabled();
  await navigate(page, "/learn");
  await page.getByLabel("Give your idea a name", { exact: true }).fill("Keep me in my workshop");
  const response = page.waitForResponse(response => response.url().includes("/api/studio") && response.request().method() === "POST");
  finishRequest(); await response;
  // The completed request clears its shared pending state; inspect it by returning voluntarily.
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByLabel("Give your idea a name", { exact: true })).toHaveValue("Keep me in my workshop");
  await navigate(page, "/studio");
  await expect(page.getByRole("button", { name: "Ask Raven", exact: true })).toBeEnabled();
  await expect(page.locator(".studio-history")).toContainText("A simulated saved answer");
});

test("a delayed refresh cannot replace the newly selected saved answer", async ({ page }) => {
  const first = simulatedAnswer("11111111-1111-4111-8111-111111111111", "The first separate business question.");
  const second = simulatedAnswer("22222222-2222-4222-8222-222222222222", "The second separate business question.");
  first.result!.title = "First saved answer";
  second.result!.title = "Second saved answer";
  let delayFirst = false;
  let releaseFirst!: () => void;
  let startedFirst!: () => void;
  const delay = new Promise<void>(resolve => { releaseFirst = resolve; });
  const started = new Promise<void>(resolve => { startedFirst = resolve; });
  await page.route("**/api/studio*", async route => {
    const id = new URL(route.request().url()).searchParams.get("id");
    if (id === first.id && delayFirst) { startedFirst(); await delay; }
    const generation = id === first.id ? first : id === second.id ? second : null;
    // The superseded refresh may already be aborted by the browser.
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...readyView, generations: [first, second], generation }) }).catch(() => undefined);
  });
  await page.goto(`/studio/${first.id}`);
  await expect(page.getByRole("heading", { name: "First saved answer", exact: true })).toBeVisible();
  delayFirst = true;
  await page.getByRole("button", { name: "Refresh history", exact: true }).click();
  await started;
  await page.locator(`.studio-history a[href="/studio/${second.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/studio/${second.id}$`));
  await expect(page.getByRole("heading", { name: "First saved answer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Second saved answer", exact: true })).toBeVisible();
  releaseFirst();
  // A subsequent completed refresh proves the older request cannot restore its view.
  await page.getByRole("button", { name: "Refresh history", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh history", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Second saved answer", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "First saved answer", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/studio/${second.id}$`));
});
