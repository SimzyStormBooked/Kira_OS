import { deflateSync } from "node:zlib";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";
test.use({ reducedMotion: "reduce" });

// A real, decodable PNG, so the browser proves the sanitized container is still an image.
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Buffer) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(4); head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}
const locationText = "GPSLatitude 33.4484 N GPSLongitude 112.0740 W";
function portraitPng({ width = 6, height = 8, metadata = true } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); header.writeUInt8(2, 9); // 8-bit RGB
  const raw = Buffer.concat(Array.from({ length: height }, (_, row) => Buffer.concat([
    Buffer.from([0]), // no filter
    ...Array.from({ length: width }, (_, column) => Buffer.from([40 + row * 8, 30 + column * 6, 90])),
  ])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...(metadata ? [chunk("eXIf", Buffer.from(locationText, "latin1")), chunk("tEXt", Buffer.from("Author\0Cassie fixture", "latin1"))] : []),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
    ...(metadata ? [Buffer.from("APPENDED-FIXTURE-PAYLOAD", "latin1")] : []),
  ]);
}
type StoredPortrait = {
  id: string; status: string; stored: boolean; size_bytes: number | null; registered_size: number;
  hash_matches: boolean | null; contains_location_metadata: boolean | null;
  location_metadata_removed: boolean; sanitized_at: string | null; usage_permission: string;
  width: number | null; height: number | null;
};
// Read from the test context, not the page: the fixture is a different origin.
async function storedPortraits(request: APIRequestContext): Promise<StoredPortrait[]> {
  const response = await request.get(`${fixture.supabaseUrl}/__test/portrait-bytes`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<StoredPortrait[]>;
}
async function addCharacter(page: Page, name: string, aliases = "") {
  await page.goto("/characters");
  await page.getByRole("button", { name: "Add character", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a character", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  if (aliases) await dialog.getByLabel(/Other names they go by/).fill(aliases);
  await dialog.getByRole("button", { name: "Add character", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  return page.url().split("/characters/")[1];
}
async function uploadPortrait(page: Page, bytes: Buffer, name = "celine.png") {
  await page.getByLabel("Portrait image", { exact: true }).setInputFiles({ name, mimeType: "image/png", buffer: bytes });
  await page.getByRole("button", { name: "Add portrait", exact: true }).click();
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Enter your workspace", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("an empty studio invites a first character and finds it again by an alias", async ({ page }) => {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true }).filter({ visible: true });
  await navigation.getByRole("link", { name: /Character Studio/ }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByRole("heading", { name: "Your cast starts here.", exact: true })).toBeVisible();
  await addCharacter(page, "Celine Dubois", "The Lark, Cee");
  await expect(page.getByText("Also known as Cee, The Lark", { exact: true })).toBeVisible();
  await page.goto("/characters");
  const card = page.locator("a.character-card");
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("heading", { name: "Celine Dubois", exact: true })).toBeVisible();
  await expect(card).toContainText("0 portraits");
  // An alias is how a reader refers to someone, so it has to be searchable.
  const search = page.getByLabel("Search characters by name or alias", { exact: true });
  await search.fill("lark");
  await expect(card).toHaveCount(1);
  await search.fill("someone else entirely");
  await expect(page.locator("a.character-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No character found.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator("a.character-card")).toHaveCount(1);
});

test("an uploaded portrait loses its location metadata, still decodes, and travels only inside a signed link", async ({ page, request }) => {
  await addCharacter(page, "Celine Dubois");
  const original = portraitPng();
  expect(original.toString("latin1")).toContain("GPSLatitude");
  await uploadPortrait(page, original);
  await expect(page.getByRole("status").filter({ hasText: "Kept privately" })).toContainText("after removing exif");

  const [stored] = await storedPortraits(request);
  expect(stored).toMatchObject({
    status: "ready", stored: true, hash_matches: true, contains_location_metadata: false,
    location_metadata_removed: true, usage_permission: "private_reference_only", width: 6, height: 8,
  });
  expect(stored.sanitized_at).not.toBeNull();
  expect(stored.size_bytes).toBeLessThan(original.length);

  // The rendered image is served through a signed link and still decodes at its real size,
  // which is the part a container rewrite could silently break.
  const portrait = page.locator(".portrait-figure img");
  await expect(portrait).toHaveCount(1);
  const signedPrefix = `${fixture.supabaseUrl}/storage/v1/object/sign/kira-character-portraits/`.replace(/[.]/g, "[.]");
  await expect(portrait).toHaveAttribute("src", new RegExp(`^${signedPrefix}`));
  await expect(portrait).toHaveAttribute("src", /token=fixture-/);
  await expect.poll(async () => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(6);
  expect(await portrait.evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(8);

  const payload = await page.evaluate(async () => {
    const id = window.location.pathname.split("/").pop();
    return (await fetch(`/api/characters/${id}`)).text();
  });
  // A signed link necessarily contains the object path, so the guarantee is narrower and
  // exact: no storage_path field, and the path appears only inside an expiring signed URL.
  expect(payload).not.toContain("storage_path");
  const paths = payload.match(new RegExp(`${fixture.authorId}/`, "g")) ?? [];
  const signed = payload.match(/object\/sign\/kira-character-portraits\/[^"]*token=fixture-[a-f0-9]+/g) ?? [];
  expect(paths.length).toBeGreaterThan(0);
  expect(signed).toHaveLength(paths.length);
});

test("an image that cannot be cleaned is refused, and a duplicate is not stored twice", async ({ page, request }) => {
  await addCharacter(page, "Celine Dubois");
  await uploadPortrait(page, Buffer.from("this is not really an image", "latin1"), "broken.png");
  await expect(page.locator(".library-error[role=alert]")).toContainText("not a PNG");
  expect(await storedPortraits(request)).toHaveLength(0);

  const image = portraitPng();
  await uploadPortrait(page, image);
  await expect(page.getByRole("status").filter({ hasText: "Kept privately" })).toBeVisible();
  await expect(page.locator(".portrait-figure img")).toHaveCount(1);
  // The same image again is the same portrait, not a second copy.
  await uploadPortrait(page, image);
  await expect.poll(async () => (await storedPortraits(request)).length).toBe(1);
  await page.reload();
  await expect(page.locator(".portrait-figure img")).toHaveCount(1);
});

test("promotional use requires a recorded source before the image is kept", async ({ page, request }) => {
  await addCharacter(page, "Celine Dubois");
  await page.getByLabel("Portrait image", { exact: true }).setInputFiles({ name: "celine.png", mimeType: "image/png", buffer: portraitPng() });
  await page.getByLabel(/permission to use this image publicly/).check();
  const credit = page.getByLabel("Where it came from and who may use it", { exact: true });
  await expect(credit).toBeVisible();
  await credit.fill("Commissioned from a named illustrator");
  await page.getByRole("button", { name: "Add portrait", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kept privately" })).toBeVisible();
  expect((await storedPortraits(request))[0]).toMatchObject({ usage_permission: "promotional_approved", status: "ready" });
  await expect(page.locator(".portrait-permission")).toContainText("Cleared for promotion · Commissioned from a named illustrator");
});

test("a chosen cover reaches the gallery card and a confirmed link shows where they appear", async ({ page, request }) => {
  const profileId = await addCharacter(page, "Celine Dubois");
  await uploadPortrait(page, portraitPng());
  await expect(page.getByRole("status").filter({ hasText: "Kept privately" })).toBeVisible();
  await page.getByRole("button", { name: "Use on the card", exact: true }).click();
  await expect(page.getByText("Shown on the card", { exact: true })).toBeVisible();

  const book = await page.evaluate(async () => {
    const response = await fetch("/api/library");
    const body = await response.json();
    return body.books[0] as { id: string; title: string };
  });
  const seeded = await request.post(`${fixture.supabaseUrl}/__test/characters`, {
    data: { profileId, bookId: book.id, characterName: "Celine", note: "She never lies about the harbour.", linkNote: "Confirmed by the author." },
  });
  expect(seeded.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText("You confirmed this", { exact: true })).toBeVisible();
  await expect(page.getByText("She never lies about the harbour.", { exact: true })).toBeVisible();
  await expect(page.locator(".character-links")).toContainText(book.title);
  await expect(page.locator(".character-links")).toContainText("as Celine");

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);

  await page.goto("/characters");
  const card = page.locator("a.character-card");
  await expect(card.locator("img.character-cover")).toHaveAttribute("src", /object\/sign\/kira-character-portraits/);
  await expect(card).toContainText("1 portrait");
  await expect(card).toContainText("1 book");
});
