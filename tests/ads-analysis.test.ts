import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
import { dateRange, totals, analyzeAds } from "@/lib/ads/analysis";
import { adsPreview } from "@/lib/ads/preview";
import { renderAdsEmail } from "@/lib/ads/email";
import { verifyEmailWebhook, validUnsubscribe, unsubscribeToken } from "@/lib/ads/delivery";
describe("ad reporting calculations", () => {
 it("uses complete account-local days including a UTC date boundary", () => { expect(dateRange(new Date("2026-09-21T03:00:00Z"),"America/Phoenix")).toEqual({since:"2026-09-06",until:"2026-09-19",split:"2026-09-13"}); });
 it("derives weighted costs from totals and does not turn unknown purchases into zero", () => {
  const rows=adsPreview().rows.slice(0,2); rows[0].spend=10; rows[0].linkClicks=1; rows[1].spend=10; rows[1].linkClicks=9;
  expect(totals(rows).cpc).toBe(2); expect(totals(rows).purchases).toBeNull();expect(totals(rows).roas).toBeNull();
  expect(totals([]).cpc).toBeNull();expect(totals([]).ctr).toBeNull();
 });
 it("compares like periods, flags click costs and screens small samples without a sales verdict", () => { const a=analyzeAds(adsPreview());expect(a.split).toBe("2026-09-14");expect(a.campaigns[0].recent.clicks).toBe(140);expect(a.campaigns[0].prior.clicks).toBe(175);expect(a.campaigns[0].change).toBeCloseTo(25);expect(a.campaigns[0].status).toBe("Review click costs");const s=adsPreview();s.rows=s.rows.slice(0,2);expect(analyzeAds(s).campaigns[0].status).toBe("More data needed"); });
 it("escapes advertiser-controlled HTML and labels sample emails", () => { const s=adsPreview();s.account.name='<img src=x onerror="alert(1)">';s.rows[0].campaignName='<script>bad()</script>';const email=renderAdsEmail(s,"https://kira.test/ads","https://kira.test/unsubscribe");expect(email.html).not.toContain('<script>');expect(email.html).toContain('&lt;img');expect(email.html).toContain("FICTIONAL SAMPLE DATA");expect(email.subject).toContain("[PREVIEW]"); });
});
describe("email capability and webhook integrity",()=>{
 it("binds unsubscribe tokens to workspace and recipient",()=>{vi.stubEnv("KIRA_AI_RECORDING_KEY","a".repeat(64));const a="00000000-0000-4000-8000-000000000001",u="00000000-0000-4000-8000-000000000002",other="00000000-0000-4000-8000-000000000003";const token=unsubscribeToken(a,u);expect(validUnsubscribe(a,u,token)).toBe(true);expect(validUnsubscribe(a,other,token)).toBe(false);expect(validUnsubscribe(other,u,token)).toBe(false);vi.unstubAllEnvs();});
 it("rejects tampered bodies and old signed webhooks",()=>{const now=Date.now(),timestamp=String(Math.floor(now/1000)),secret=Buffer.from("test webhook secret").toString("base64"),raw='{"type":"email.delivered"}',id="test-event";const sig=createHmac("sha256",Buffer.from(secret,"base64")).update(`${id}.${timestamp}.${raw}`).digest("base64");const headers=new Headers({"svix-id":id,"svix-timestamp":timestamp,"svix-signature":`v1,${sig}`});expect(verifyEmailWebhook(raw,headers,`whsec_${secret}`,now)).toBe(id);expect(()=>verifyEmailWebhook(raw+" ",headers,`whsec_${secret}`,now)).toThrow();expect(()=>verifyEmailWebhook(raw,headers,`whsec_${secret}`,now+360000)).toThrow();});
});
