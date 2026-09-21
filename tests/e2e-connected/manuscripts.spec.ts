import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture-data";
test.use({reducedMotion:"reduce"});
async function addBook(page: Page, title: string) {
  await page.goto("/universe"); await page.getByRole("button",{name:"Add book",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Add a book",exact:true});await dialog.getByLabel("Book title",{exact:true}).fill(title);
  await dialog.getByRole("button",{name:"Add book",exact:true}).click();await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
  const body=await page.evaluate(async()=>{const response=await fetch("/api/library");if(!response.ok)throw new Error(`Library read failed: ${response.status}`);return response.json();}); return body.books.find((book:{title:string})=>book.title===title) as {id:string;slug:string};
}
test.beforeEach(async({page,request})=>{
  expect((await request.post(`${fixture.supabaseUrl}/__test/reset`)).ok()).toBe(true);
  await page.goto("/login");await page.getByLabel("Email address").fill(fixture.memberEmail);await page.getByLabel("Password",{exact:true}).fill(fixture.password);await page.getByRole("button",{name:"Enter your workspace",exact:true}).click();await expect(page.locator(".app-shell")).toBeVisible();
});
test("a private book, series and audio details survive reload and appear in catalog and global search",async({page})=>{
  const book=await addBook(page,"Synthetic Library Book");await page.getByRole("button",{name:"Edit book details",exact:true}).first().click();
  const dialog=page.getByRole("dialog",{name:"Edit book details",exact:true});await dialog.getByLabel("Series or collection").selectOption("new");await dialog.getByLabel("New series name").fill("Fixture Series");await dialog.getByLabel("Book number").fill("2");await dialog.getByLabel("Author-approved description").fill("A synthetic catalog description for browser verification.");
  await dialog.locator("summary").click();await dialog.getByLabel("Audiobook available",{exact:true}).check();await dialog.getByLabel("Narrator",{exact:true}).fill("Fixture Narrator");await dialog.getByLabel("Runtime in minutes").fill("360");await dialog.getByRole("button",{name:"Save book details",exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(page.locator("#main-content").getByText("Narrated by Fixture Narrator · 360 minutes",{exact:true})).toBeVisible();await page.reload();await expect(page.locator("#main-content").getByText("Narrated by Fixture Narrator · 360 minutes",{exact:true})).toBeVisible();
  await page.goto("/universe");await page.getByRole("button",{name:"Fixture Series",exact:true}).click();await expect(page.locator("a.book-card")).toHaveCount(1);await expect(page.locator("a.book-card")).toHaveAttribute("href",`/universe/${book.slug}`);
  await page.getByRole("button",{name:"Search workspace",exact:true}).click();await page.getByLabel("Search books, briefs and pages",{exact:true}).fill("Synthetic Library Book");await expect(page.getByRole("dialog").getByRole("link",{name:/Synthetic Library Book/})).toBeVisible();
});
test("upload requires permission, preserves queued work when AI is disabled and can be reopened",async({page})=>{
  const book=await addBook(page,"Synthetic Upload Book");const text="Synthetic reference text: Rowan is a coordinator. An archive stores the project records for the team.";
  await page.getByLabel("Manuscript file",{exact:true}).setInputFiles({name:"reference.txt",mimeType:"text/plain",buffer:Buffer.from(text)});
  const save=page.getByRole("button",{name:"Save manuscript",exact:true});await save.click();
  expect((await page.evaluate(async(id)=>(await fetch(`/api/library/${id}`)).json(),book.id)).manuscripts).toHaveLength(0);
  // Saving the file and sending its text to a model are two separate consents.
  await page.getByLabel(/I have permission to upload/).check();await save.click();await expect(page.getByRole("heading",{name:"Ready to read",exact:true})).toBeVisible();
  await expect(page.locator(".library-success[role=status]")).toContainText("Nothing has been read yet");await expect(page.locator(".library-error[role=alert]")).toHaveCount(0);
  const start=page.getByRole("button",{name:"Start reading with Raven",exact:true});await expect(start).toBeEnabled();await start.click();await expect(page.locator(".library-error[role=alert]")).toContainText("AI setup");
  await page.reload();await expect(page.getByText("reference.txt · 0 of 1 passages read",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Resume reading",exact:true})).toBeEnabled();
  const detail=await page.evaluate(async(id)=>(await fetch(`/api/library/${id}`)).json(),book.id);expect(detail.manuscripts).toHaveLength(1);expect(detail.intelligence).toBeNull();
  await page.getByLabel("Manuscript file",{exact:true}).setInputFiles({name:"reference.txt",mimeType:"text/plain",buffer:Buffer.from(text)});await page.getByLabel(/I have permission to upload/).check();await save.click();
  await expect(page.locator(".library-success[role=status]")).toContainText("Nothing has been read yet");expect((await page.evaluate(async(id)=>(await fetch(`/api/library/${id}`)).json(),book.id)).manuscripts).toHaveLength(1);
});
test("learned knowledge has private citations, hides spoilers, searches text, and retains the good version during replacement",async({page,request},testInfo)=>{
  const book=await addBook(page,"Synthetic Knowledge Book");
  const text="Rowan is the coordinator in this synthetic reference record. The team keeps its documents in an archive. A private outcome is recorded here.";
  const seeded=await request.post(`${fixture.supabaseUrl}/__test/manuscripts`,{data:{bookId:book.id,text}});expect(seeded.ok()).toBe(true);await page.reload();
  await expect(page.getByRole("heading",{name:"Knowledge ready",exact:true})).toBeVisible();
  await expect(page.locator("#main-content").getByText(/findings with potential spoilers are hidden/)).toBeVisible();
  await expect(page.locator(".knowledge-character")).toHaveCount(1);
  await page.getByLabel("Find a character",{exact:true}).fill("Coordinator");
  await expect(page.locator(".knowledge-character")).toHaveCount(1);
  await page.getByLabel("Find a character",{exact:true}).fill("missing");
  await expect(page.locator(".knowledge-character")).toHaveCount(0);
  await page.getByLabel("Find a character",{exact:true}).fill("Rowan");
  await expect(page.getByRole("heading",{name:"Rowan",exact:true})).toBeVisible();
  await expect(page.getByText("A second synthetic observation of the same character.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Read supporting passage",exact:true}).first().click();const dialog=page.getByRole("dialog");await expect(dialog.locator("blockquote")).toContainText(text);await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Story Arc",exact:true}).click();
  await expect(page.locator(".knowledge-fact-group")).toHaveCount(0);
  await page.getByLabel("Reveal plot details and potential spoilers",{exact:true}).check();
  await expect(page.locator(".knowledge-fact-group")).toHaveCount(1);
  await page.getByLabel("Reveal plot details and potential spoilers",{exact:true}).uncheck();
  await expect(page.getByText("Synthetic spoiler detail for reveal-control verification.",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Marketing",exact:true}).click();
  await expect(page.locator(".knowledge-fact-group")).toHaveCount(2);
  await expect(page.getByText("WHAT CAN I DO WITH THIS?",{exact:true})).toBeVisible();
  await expect(page.getByText("Manuscript-supported · unreviewed",{exact:true})).toBeVisible();
  await page.getByLabel(/Show manuscript excerpts/).check();await page.getByLabel("Search manuscript",{exact:true}).fill("Rowan");await page.getByRole("button",{name:"Find passages",exact:true}).click();await expect(page.locator(".library-search-result")).toContainText("Rowan");
  await page.screenshot({path:testInfo.outputPath("manuscript-knowledge.png"),fullPage:true});
  let releaseSearch!:()=>void; const heldSearch=new Promise<void>(resolve=>{releaseSearch=resolve;});
  await page.route("**/api/library/search?**",async route=>{await heldSearch;await route.continue();});
  const pendingSearch=page.waitForRequest(request=>request.url().includes("/api/library/search?"));
  await page.getByRole("button",{name:"Find passages",exact:true}).click();await pendingSearch;
  await page.getByLabel(/Show manuscript excerpts/).uncheck();
  const completedSearch=page.waitForResponse(response=>response.url().includes("/api/library/search?"));releaseSearch();await completedSearch;
  await expect(page.locator(".library-search-result")).toHaveCount(0);
  await page.getByLabel(/Show manuscript excerpts/).check();await expect(page.locator(".library-search-result")).toHaveCount(0);
  await page.unroute("**/api/library/search?**");
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByLabel("Manuscript file",{exact:true}).setInputFiles({name:"revision.txt",mimeType:"text/plain",buffer:Buffer.from(text+" This is a revised source record.")});await page.getByLabel(/I have permission to upload/).check();await page.getByRole("button",{name:"Save manuscript",exact:true}).click();await expect(page.getByRole("heading",{name:"Ready to read",exact:true})).toBeVisible();await expect(page.getByText("The previous completed version remains available below until this version is ready.",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"What Raven learned",exact:true})).toBeVisible();await page.reload();await expect(page.getByText("The previous completed version remains available below until this version is ready.",{exact:true})).toBeVisible();
});


test("knowledge actions carry the selected evidence, preserve unfinished Raven work, and expose deep search matches",async({page,request},testInfo)=>{
 const book=await addBook(page,"Synthetic Action Book");
 expect((await request.post(`${fixture.supabaseUrl}/__test/manuscripts`,{data:{bookId:book.id,text:"Synthetic permission-approved reference for interface testing. Rowan works with Mira in the archive.",extended:true}})).ok()).toBe(true);await page.reload();
 await page.getByRole("group",{name:"Character details",exact:true}).getByRole("button",{name:"Relationships",exact:true}).click();
 await page.getByRole("button",{name:"Explore this character with Raven",exact:true}).click();
 let dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Question to explore")).toHaveValue(/Rowan works with Mira/);await expect(dialog.getByLabel("Question to explore")).toHaveValue(/Relationships/);await page.keyboard.press("Escape");
 await page.getByRole("button",{name:"Save next step to my Desk",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"Saved to Cassandra"})).toBeVisible();
 await page.getByRole("button",{name:"Marketing",exact:true}).click();await page.getByLabel("Find an observation",{exact:true}).fill("late-match-signal");await expect(page.locator(".knowledge-signal")).toHaveCount(1);await expect(page.locator(".knowledge-signal")).toContainText("late-match-signal");
 await page.getByRole("button",{name:"Explore this angle",exact:true}).click();dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Question to explore")).toHaveValue(/late-match-signal/);
 await page.route("**/api/studio",async route=>{if(route.request().method()==="GET")await route.fulfill({json:{role:"editor",availability:{available:true,reason:"ready",message:"Synthetic test availability"},generations:[],generation:null}});else throw new Error("Preparing a question must not submit an AI request");});
 await dialog.getByRole("button",{name:"Open in Ask Raven",exact:true}).click();await expect(page).toHaveURL(/\/studio$/);await expect(page.getByLabel("Your question and useful context",{exact:true})).toHaveValue(/late-match-signal/);await expect(page.getByRole("checkbox",{name:"Synthetic Action Book",exact:true})).toBeChecked();
 if(await page.getByRole("button",{name:"Open navigation",exact:true}).isVisible())await page.getByRole("button",{name:"Open navigation",exact:true}).click();
 await page.getByRole("link",{name:/^The Universe/}).first().click();await page.locator(`a[href="/universe/${book.slug}"]`).first().click();await page.getByRole("button",{name:"Explore this character with Raven",exact:true}).click();dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"Open in Ask Raven",exact:true})).toBeDisabled();await expect(dialog).toContainText("will not overwrite");await page.keyboard.press("Escape");
 await page.getByRole("button",{name:"Marketing",exact:true}).click();await page.locator(".book-knowledge").screenshot({path:testInfo.outputPath("knowledge-workbench.png")});expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
