"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, Sparkles } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/lib/db/demo-store";

const studioStatus = z.object({ availability: z.object({ available: z.boolean(), reason: z.enum(["ready", "disabled", "funding", "unavailable"]) }) });
const metaStatus = z.object({ configured: z.boolean(), unavailable: z.boolean().optional(), connection: z.object({ status: z.string() }).nullable() });
type Status = { ai: z.infer<typeof studioStatus>["availability"] | null; meta: z.infer<typeof metaStatus> | null };

export function SetupStatus() {
  const { mode, role, roleError, refresh: refreshWorkspace } = useWorkspace();
  const [status, setStatus] = useState<Status>({ ai: null, meta: null });
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const owner = role === "owner" && !roleError;
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    let sessionEnded = false;
    const read = async (url: string) => {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (response.status === 401 || response.status === 403) sessionEnded = true;
      if (!response.ok) throw new Error("Status unavailable");
      return response.json() as Promise<unknown>;
    };
    const [ai, meta] = await Promise.allSettled([read("/api/studio").then(data => studioStatus.parse(data).availability), read("/api/connections/meta").then(data => metaStatus.parse(data))]);
    if (controller.signal.aborted) return;
    if (sessionEnded) {
      await refreshWorkspace();
      if (controller.signal.aborted) return;
    }
    setStatus({ ai: ai.status === "fulfilled" ? ai.value : null, meta: meta.status === "fulfilled" ? meta.value : null });
    setLoading(false);
  }, [refreshWorkspace]);
  useEffect(() => {
    if (mode !== "connected") return;
    let active = true;
    void Promise.resolve().then(() => { if (active) return refresh(); });
    return () => { active = false; request.current?.abort(); };
  }, [mode, refresh]);
  if (mode !== "connected") return null;

  const aiReady = status.ai?.available === true;
  const metaReady = status.meta?.connection?.status === "authorized";
  return <Card id="setup" className="settings-card setup-card" aria-labelledby="setup-heading" aria-busy={loading}>
    <div className="section-heading"><h2 id="setup-heading">Your workspace connections</h2><Sparkles size={19} aria-hidden="true" /></div>
    <p>See what is ready and find the next step in one place.</p>
    <div className="setup-services">
      <section aria-labelledby="setup-ai-heading">
        <div className="setup-service-heading"><h3 id="setup-ai-heading">Ask Raven</h3><span className="status-pill">{loading ? "CHECKING" : !status.ai ? "CHECK AGAIN" : aiReady ? "READY" : "SETUP NEEDED"}</span></div>
        <p>{loading ? "Checking whether Raven is ready for your next question…" : aiReady ? "Brainstorm a business idea, design an assistant, or learn something useful. Each answer is saved for you to revisit."
          : !status.ai || status.ai.reason === "unavailable" ? "The AI connection could not be confirmed. Refresh its status before trying again."
          : owner ? "Finish AI credit setup, then have the connection activated and tested. A credit balance alone does not confirm that the selected model is available."
          : "Your workspace owner is finishing the AI connection. You can build and save a blueprint in Learn & Create now."}</p>
        <div className="settings-actions">
          {aiReady ? <Button asChild><Link href="/studio">Ask Raven <ArrowUpRight size={15} /></Link></Button>
            : <Button asChild variant="outline"><Link href="/learn">Build a blueprint now</Link></Button>}
          {owner && !aiReady && <a className="text-link" href="https://vercel.com/storm-booked/~/ai-gateway" target="_blank" rel="noopener noreferrer">Open AI credit setup <ArrowUpRight size={14} /><span className="sr-only"> (opens in a new tab)</span></a>}
        </div>
      </section>
      <section aria-labelledby="setup-meta-heading">
        <div className="setup-service-heading"><h3 id="setup-meta-heading">Instagram & Facebook</h3><span className="status-pill">{loading ? "CHECKING" : !status.meta || status.meta.unavailable ? "CHECK AGAIN" : metaReady ? "AUTHORIZED" : status.meta.connection ? "RECONNECT NEEDED" : status.meta.configured ? "READY TO AUTHORIZE" : "SETUP NEEDED"}</span></div>
        <p>{loading ? "Checking your saved social authorization…" : metaReady ? "Account authorization is saved. Open Connections to review its status. Social analytics and automatic posting are not active."
          : !status.meta || status.meta.unavailable ? "Social authorization could not be checked. Refresh the status or open Connections to try again."
          : status.meta.configured && owner ? "The app setup is ready. Open Connections to authorize your Facebook Page and linked Instagram account. You choose which accounts to share."
          : owner ? "Finish the Meta app setup, then authorize the intended Facebook Page and linked Instagram account in Connections. You can keep useful profile links there now."
          : "Your workspace owner manages social authorization. Add your profile links in Connections to keep them close while setup is completed."}</p>
        <div className="settings-actions"><Button asChild variant="outline"><Link href="/connections">Open Connections</Link></Button>
          {owner && !metaReady && !status.meta?.configured && <a className="text-link" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Open Meta setup <ArrowUpRight size={14} /><span className="sr-only"> (opens in a new tab)</span></a>}
        </div>
      </section>
    </div>
    <Button type="button" variant="ghost" disabled={loading} onClick={() => { setLoading(true); void refresh(); }}><RefreshCw size={15} />{loading ? "Checking connections…" : "Refresh connection status"}</Button>
    <p className="quiet-note" role="status">{loading ? "Checking the current connection status…" : "Connection check complete. Refreshing does not connect accounts or purchase credits."}</p>
  </Card>;
}
