import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceConfig } from "@/lib/config";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { adsConfig } from "./meta";
import { adsViewSchema, type AdsView } from "./contract";
export function recordingKey() { const key = process.env.KIRA_AI_RECORDING_KEY; if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("Reporting setup is pending."); return key; }
export async function adsControl(client: SupabaseClient, authorId: string, action: string, payload: unknown = {}) {
  const { data, error } = await client.rpc("ads_control", { p_author_id: authorId, p_action: action, p_payload: payload, p_key: recordingKey() });
  if (error) throw new Error(error.code === "42501" ? "You do not have permission for that action." : error.code === "55P03" ? "Wait five minutes between refreshes; an existing job may still be finishing." : error.code === "22023" ? "Reconnect your account or restart this setup step." : "Advertising storage is unavailable. Your saved reports are safe.");
  return data;
}
export async function adsWorker(action: string, id: string | null = null, run: string | null = null, payload: unknown = {}) {
  const config = getWorkspaceConfig(); if (!config.configured || config.mode !== "connected" || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error("Reporting setup is pending.");
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("ads_worker", { p_action: action, p_id: id, p_run: run, p_payload: payload, p_key: recordingKey() });
  if (error) throw new Error("Reporting operation could not finish."); return data;
}
export function emailReady() { return Boolean(process.env.RESEND_API_KEY && process.env.KIRA_ADS_EMAIL_FROM && process.env.KIRA_ADS_EMAIL_VERIFIED === "true" && process.env.RESEND_WEBHOOK_SECRET && process.env.CRON_SECRET); }
export async function loadAdsView(): Promise<AdsView> {
  const session = await requireWorkspaceSession();
  const base: AdsView = { configured: Boolean(adsConfig()), emailConfigured: emailReady(), canEdit: (await getWorkspaceRole(session)) !== "viewer", available: false, email: session.user.email, connection: null, subscription: false, links: {}, inspiration: [], books: [], reports: [], jobs: [], deliveries: [] };
  try {
    const connection = await adsControl(session.supabase, session.authorId, "view");
    const results = await Promise.all([
      session.supabase.from("ads_reports").select("id,created_at,snapshot").eq("author_id", session.authorId).eq("account_id", connection?.selected ?? "act_0").order("created_at", { ascending: false }).limit(12),
      session.supabase.from("ads_jobs").select("id,state,error_code,created_at").eq("author_id", session.authorId).order("created_at", { ascending: false }).limit(5),
      session.supabase.from("ads_subscriptions").select("enabled").eq("author_id", session.authorId).eq("user_id", session.user.id).maybeSingle(),
      session.supabase.from("ads_book_links").select("campaign_id,book_id").eq("author_id", session.authorId),
      session.supabase.from("books").select("id,title").eq("author_id", session.authorId).order("title"),
      session.supabase.from("ads_inspiration").select("id,title,url,note").eq("author_id", session.authorId).order("created_at", { ascending: false }).limit(50),
      session.supabase.from("ads_deliveries").select("status,created_at").eq("author_id", session.authorId).eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(5),
    ]);
    if (results.some(r => r.error)) return base;
    const [reports, jobs, subscription, links, books, inspiration, deliveries] = results;
    return adsViewSchema.parse({ ...base, available: true, connection, reports: reports.data, jobs: jobs.data, subscription: subscription.data?.enabled ?? false, links: Object.fromEntries((links.data ?? []).map(l => [l.campaign_id, l.book_id])), books: books.data, inspiration: inspiration.data, deliveries: deliveries.data });
  } catch { return base; }
}
