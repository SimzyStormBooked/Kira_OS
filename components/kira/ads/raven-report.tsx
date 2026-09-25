"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bird } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/db/demo-store";
import { studioRequestSignature } from "@/lib/ai/studio-contract";
import { adsQuestions, adsRavenContext, type AdsQuestion } from "@/lib/ads/raven-context";
import type { AdsSnapshot, AdsView } from "@/lib/ads/contract";
import "./raven-report.css";

export function AdsRavenReport({ snapshot, reportId, view, preview }: { snapshot: AdsSnapshot; reportId?: string; view: AdsView; preview: boolean }) {
  const { ready, busy, canEdit, studioScratchpad, updateStudioScratchpad } = useWorkspace();
  const router = useRouter();
  const [choice, setChoice] = useState<AdsQuestion | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const disabled = preview || !reportId || !ready || busy || !canEdit || !view.canEdit || Boolean(studioScratchpad.pendingRequestId);
  function prepare(kind: AdsQuestion) {
    if (disabled || !reportId) return;
    const context = adsRavenContext(snapshot, reportId, view, kind);
    updateStudioScratchpad({ job: "brainstorm", prompt: context.prompt, bookIds: context.bookIds, includeSpoilers: false, savedSignature: null, requestIdentity: null, submittedId: null, pendingRequestId: null });
    setChoice(null); router.push("/studio");
  }
  return <Card className="ads-panel ads-raven-report"><div className="ads-section-head"><div><span className="eyebrow">YOUR NUMBERS, A USEFUL CONVERSATION</span><h2>What would you like to explore?</h2><p>Take this report to Raven with the context already filled in. Choose a direction, review your question, then ask when you’re ready.</p></div><Bird size={30} aria-hidden="true"/></div>
    <div className="ads-raven-options">{(Object.keys(adsQuestions) as AdsQuestion[]).map(kind => <Button key={kind} variant="outline" disabled={disabled} onClick={event => { trigger.current = event.currentTarget; if (studioScratchpad.prompt.trim() && studioScratchpad.savedSignature !== studioRequestSignature(studioScratchpad)) setChoice(kind); else prepare(kind); }}><span><strong>{adsQuestions[kind].title}</strong><small>{adsQuestions[kind].description}</small></span><ArrowUpRight size={18} aria-hidden="true"/></Button>)}</div>
    <p className="quiet-note">Works with saved CSV reports too. Up to four books you explicitly mapped to campaigns can be selected as references. AI credits are used only when you submit the question in Ask Raven.</p>
    {Boolean(studioScratchpad.pendingRequestId) && <p className="quiet-note">An earlier Raven question is still pending. Open Ask Raven to check it before starting another.</p>}
    <Dialog open={Boolean(choice)} onOpenChange={open => { if (!open) setChoice(null); }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}><DialogHeader><DialogTitle>Keep your unfinished question?</DialogTitle><DialogDescription>You already have a question in Ask Raven. You can open it as it is, or replace that draft with a question about this report. No AI request has been sent.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setChoice(null)}>Stay with my report</Button><Button variant="outline" onClick={() => { setChoice(null); router.push("/studio"); }}>Open my current question</Button><Button disabled={disabled} onClick={() => { if (choice) prepare(choice); }}>Use report question</Button></DialogFooter></DialogContent></Dialog>
  </Card>;
}
