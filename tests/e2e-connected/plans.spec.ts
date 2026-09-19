import {randomUUID} from "node:crypto";
import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {fixture} from "./fixture-data";
import type {StrategyPlan,StrategyRevision,StrategyTask} from "@/lib/strategy/contract";
// UI-only simulated API. Real authorization and persistence are covered by SQL/API suites.
test("builds, reviews and activates an accessible dated plan",async({page,request},testInfo)=>{
 await request.post(`${fixture.supabaseUrl}/__test/reset`);
 let plan:StrategyPlan|null=null;const revisions:StrategyRevision[]=[],tasks:StrategyTask[]=[];const now="2026-09-18T00:00:00Z";
 await page.route("**/api/plans*",async route=>{
  if(route.request().method()==="GET")return route.fulfill({json:route.request().url().includes("?id=")?{role:"owner",detail:{plan,revisions,tasks,results:[],reviews:[]}}:{role:"owner",plans:plan?[plan]:[]}});
  const body=route.request().postDataJSON();
  if(body.action==="save")plan={id:body.id,author_id:fixture.authorId,created_by:fixture.memberId,title:body.input.title,input:body.input,origin_approval_id:null,origin_snapshot:null,status:"draft",version:0,latest_revision_id:null,approved_revision_id:null,active_revision_id:null,campaign_id:null,auto_approve:false,created_at:now,updated_at:now};
  if(!plan)return route.fulfill({status:400,json:{error:"Save first"}});
  if(body.action==="generate"){
   const citations=[{evidence_id:"request",quote:plan.input.intent.slice(0,40)}];
   const revision:StrategyRevision={id:body.requestId,author_id:fixture.authorId,plan_id:plan.id,created_by:fixture.memberId,revision:1,plan_version:plan.version,status:"complete",model:"simulated-browser-fixture",input_snapshot:{input:plan.input,captured_at:now,evidence:[{id:"request",kind:"request",label:"Your planning request",text:plan.input.intent,book_id:null,source_id:null,manuscript_id:null,chunk_id:null}]},output:{title:"A manageable release campaign",summary:"Synthetic browser-test proposal. No paid AI call occurred.",positioning:"Test a message, then learn from actual responses.",audiences:[{segment:"new_readers",why:"Chosen by the author",citations}],recommendations:[{title:"One small test",action:"Prepare a social post for human review.",rationale:"Test a hypothesis before spending.",channel:"Instagram",effort:"low",estimated_cost_usd:0,goal_ids:[],citations}],phases:([90,60,30] as const).map(window=>({window,label:`${window} days before release`,focus:"Prepare and review",tasks:[{title:`Review the ${window}-day step`,instructions:"Check the book details before using them.",channel:"Instagram",day_offset:-window,goal_ids:[],success_measure:"One reviewed idea",citations}]})),risks:["Audience fit is unknown."],questions:[]},usage:null,error_code:null,created_at:now,completed_at:now};revisions.push(revision);plan.latest_revision_id=revision.id;plan.status="needs_review";plan.version++;return route.fulfill({json:{revision}});
  }
  if(body.action==="review"){plan.status=body.decision;plan.approved_revision_id=revisions[0].id;plan.version++;}
  if(body.action==="activate"){plan.status="active";plan.active_revision_id=revisions[0].id;plan.campaign_id=randomUUID();plan.version++;for(const phase of revisions[0].output!.phases)tasks.push({id:randomUUID(),author_id:fixture.authorId,plan_id:plan.id,revision_id:revisions[0].id,campaign_id:plan.campaign_id,phase:phase.window,ordinal:phase.window,due_date:`2026-${phase.window===90?"09":phase.window===60?"10":"11"}-20`,definition:phase.tasks[0],status:"todo",version:0,completed_by:null,completed_at:null,created_at:now,updated_at:now});}
  if(body.action==="task"){const t=tasks.find(t=>t.id===body.id)!;t.status=body.status;t.version++;return route.fulfill({json:{task:t}});}
  return route.fulfill({json:{plan}});
 });
 await page.goto("/login");await page.getByLabel("Email address").fill(fixture.memberEmail);await page.getByLabel("Password",{exact:true}).fill(fixture.password);await page.getByRole("button",{name:"Enter your workspace",exact:true}).click();await expect(page.locator(".app-shell")).toBeVisible();
 await page.goto("/plans");await page.getByRole("button",{name:"Launch",exact:true}).click();await page.getByLabel("Release date",{exact:true}).fill("2026-12-20");await page.getByRole("spinbutton",{name:"Budget for the whole plan ($)",exact:true}).fill("0");await page.getByRole("button",{name:"Save plan details"}).click();await expect(page.getByRole("heading",{name:"Draft",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Ask Raven to build this plan"}).click();await expect(page.getByRole("heading",{name:"Needs owner review",exact:true})).toBeVisible();await page.getByText("Why Raven suggested this",{exact:true}).first().click();await expect(page.locator("blockquote").first()).toContainText("Build a practical");
 await page.getByLabel("Review notes").fill("Reviewed the evidence, dates and zero spend.");await page.getByRole("button",{name:"Approve this revision"}).click();await page.getByRole("button",{name:"Activate dated tasks"}).click();await expect(page.getByRole("heading",{name:"Active",exact:true})).toBeVisible();await expect(page.getByRole("combobox",{name:/^Progress for/})).toHaveCount(3);await page.getByRole("combobox",{name:/^Progress for/}).first().selectOption("done");await page.reload();await expect(page.getByRole("combobox",{name:/^Progress for/}).first()).toHaveValue("done");
 expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath("marketing-plan.png"),fullPage:true});
});
