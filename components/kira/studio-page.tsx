"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Bird, Check, Clipboard, Lightbulb, RefreshCw } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/db/demo-store";
import { studioFailureMessages, studioGenerationSchema, studioJobLabels, studioJobs, type StudioGeneration, type StudioJob } from "@/lib/ai/studio-contract";

const responseSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
  availability: z.object({ available: z.boolean(), reason: z.enum(["ready", "disabled", "funding", "unavailable"]), message: z.string() }),
  generations: studioGenerationSchema.array(), generation: studioGenerationSchema.nullable(),
});
type StudioView = z.infer<typeof responseSchema>;
const starters: Record<StudioJob, string> = {
  brainstorm: "Help me compare three manageable ways to bring new attention to one of my published books. I have two hours this week. Ask me for the book details you need.",
  "agent-design": "Help me create a new business-agent idea for Michael. Start with a clear job, the information it would need, and a small example we can discuss. I will decide whether to share it.",
  learning: "Teach me how to give an AI assistant useful context for an author-business task. Give me a small example, then a question I can practice with.",
};
function plainAnswer(generation: StudioGeneration) {
  const result = generation.result;
  if (!result) return "";
  return [result.title, result.summary, ...result.options.map((option) => [option.title, option.idea, `Tradeoff: ${option.tradeoff}`, `First step: ${option.first_step}`, ...option.verify.map((check) => `Check: ${check}`)].join("\n")), ...result.questions.map((question) => `Question: ${question}`), "AI-generated thinking for human review. No sources were opened or external actions taken."].join("\n\n");
}

export function StudioPage({ generationId }: { generationId?: string }) {
  const { mode } = useWorkspace();
  const router = useRouter();
  const [view, setView] = useState<StudioView | null>(null);
  const [job, setJob] = useState<StudioJob>("brainstorm");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(mode === "connected");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const requestIdentity = useRef<{ signature: string; id: string } | null>(null);
  const submitLock = useRef(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const canAsk = Boolean(view?.availability.available && view.role !== "viewer" && mode === "connected");
  const generation = view?.generation ?? null;

  const load = useCallback(async (signal?: AbortSignal) => {
    if (mode !== "connected") return;
    try {
      const response = await fetch(`/api/studio${generationId ? `?id=${generationId}` : ""}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Your saved questions could not be loaded.");
      setView(responseSchema.parse(data));
      setError(null);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error && !(failure instanceof z.ZodError) ? failure.message : "Your saved questions could not be loaded.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [generationId, mode]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  function refresh() { setLoading(true); void load(); }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAsk || busy || submitLock.current) return;
    const cleanPrompt = prompt.trim();
    if (cleanPrompt.length < 10 || cleanPrompt.length > 6000) { setError("Write a question of 10 to 6,000 characters."); questionRef.current?.focus(); return; }
    const signature = JSON.stringify({ job, prompt: cleanPrompt });
    if (requestIdentity.current?.signature !== signature) requestIdentity.current = { signature, id: crypto.randomUUID() };
    const id = requestIdentity.current.id;
    submitLock.current = true;
    setBusy(true); setError(null); setNotice(null); setSubmittedId(id);
    try {
      const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, job, prompt: cleanPrompt }) });
      const data = await response.json();
      if (!response.ok) {
        setSubmittedId(data.requestId === id ? id : null);
        throw new Error(typeof data.error === "string" ? data.error : "Your question could not be completed.");
      }
      const saved = studioGenerationSchema.parse(data.generation);
      setView((previous) => previous ? { ...previous, generation: saved, generations: [saved, ...previous.generations.filter((item) => item.id !== saved.id)] } : previous);
      router.push(`/studio/${saved.id}`);
      setNotice(saved.status === "complete" ? "Raven’s answer is saved. Take your time reviewing it." : saved.status === "pending" ? "This question is already in progress. Refresh its saved page in a moment." : "Your question is saved, along with why it could not be completed.");
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (failure) {
      setError(failure instanceof Error && !(failure instanceof z.ZodError) ? failure.message : "The response could not be confirmed. Check your saved question before sending it again.");
    } finally { submitLock.current = false; setBusy(false); }
  }

  async function copyAnswer() {
    if (!generation?.result) return;
    try { await navigator.clipboard.writeText(plainAnswer(generation)); setNotice("Answer copied. Sharing it is your choice."); }
    catch { setNotice("Copy is unavailable here. You can select the answer text and use your device’s Copy command."); }
  }

  return <div className="studio-page">
    <div className="page-heading"><div><span className="eyebrow page-kicker">ASK RAVEN / A LITTLE THINKING SPACE</span><h1>Bring a question.<br /><em>Find a next step.</em></h1><p>Brainstorm the business around your books, shape an assistant idea, or learn something new. Your writing stays yours.</p></div><Bird size={30} strokeWidth={1.3} aria-hidden="true" /></div>
    <Card className="studio-status"><Lightbulb size={19} aria-hidden="true" /><div><strong>{mode === "demo" ? "Try the workshop first" : view?.availability.available ? "Raven is available when you ask" : "Ask Raven is not available yet"}</strong><p>{mode === "demo" ? "Live AI is available only in the connected private workspace. Learn & Create lets you shape an agent blueprint without a model call." : loading && !view ? "Checking your private workspace and AI connection…" : view?.availability.message ?? "Your AI connection could not be confirmed."}</p><Link href="/learn">Explore Learn & Create <ArrowRight size={14} aria-hidden="true" /></Link></div></Card>

    {!generationId && <Card className="studio-question-card"><form onSubmit={ask} className="studio-form" aria-busy={busy}>
      <label htmlFor="studio-job">What would help today?</label><select id="studio-job" value={job} disabled={busy} onChange={(event) => setJob(event.target.value as StudioJob)}>{studioJobs.map((item) => <option key={item} value={item}>{studioJobLabels[item]}</option>)}</select>
      <div className="studio-question-label"><label htmlFor="studio-question">Your question and useful context</label><Button type="button" variant="ghost" disabled={busy || prompt.trim().length > 0} onClick={() => { setPrompt(starters[job]); questionRef.current?.focus(); }}>Try a starting question</Button></div>
      <Textarea ref={questionRef} id="studio-question" rows={6} minLength={10} maxLength={6000} required value={prompt} disabled={busy} onChange={(event) => { setPrompt(event.target.value); setSubmittedId(null); }} aria-describedby="studio-privacy-note" placeholder="What are you working on, what do you know, and where would a second perspective help?" />
      <p id="studio-privacy-note" className="studio-help">Only this question is sent to the AI provider. Include approved facts you want to share; Raven cannot open your links or accounts. The question and answer are saved in this workspace.</p>
      {view?.role === "viewer" && <p className="studio-help">Your viewer access lets you read saved answers. An owner or editor can ask a new question.</p>}
      <div className="studio-submit"><Button type="submit" disabled={!canAsk || busy || loading}>{busy ? "Raven is thinking…" : <>Ask Raven <ArrowRight size={15} aria-hidden="true" /></>}</Button><span>Up to 20 questions per workspace each day. No automatic retries.</span></div>
      {busy && <p role="status">Your question is being saved and considered. Its answer will be available in recent questions.</p>}
    </form></Card>}

    {generation && <Card className="studio-result" aria-labelledby="studio-result-title"><span className="eyebrow">{generation.status === "complete" ? "AI-GENERATED / FOR YOUR REVIEW" : "SAVED QUESTION"}</span><h2 ref={resultRef} tabIndex={-1} id="studio-result-title">{generation.result?.title ?? studioJobLabels[generation.job]}</h2><details className="studio-original"><summary>Your original question</summary><p>{generation.prompt}</p></details>
      {generation.status === "pending" ? <div className="studio-pending"><p>This question has not saved a completed answer yet. It may be in progress or may have been interrupted. Refresh in a moment; it will not run again automatically.</p><Button variant="outline" type="button" disabled={loading} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh saved question</Button></div> : generation.status === "failed" ? <p className="studio-failure">{studioFailureMessages[generation.error_code ?? "provider_unavailable"]}</p> : generation.result && <>
        <p className="studio-summary">{generation.result.summary}</p><div className="studio-options">{generation.result.options.map((option, index) => <section className="studio-option" key={`${index}-${option.title}`}><span className="eyebrow">OPTION {index + 1}</span><h3>{option.title}</h3><p>{option.idea}</p><p><strong>Tradeoff:</strong> {option.tradeoff}</p><p><strong>First step:</strong> {option.first_step}</p>{option.verify.length > 0 && <><h4>Before you rely on it</h4><ul>{option.verify.map((check, item) => <li key={item}>{check}</li>)}</ul></>}</section>)}</div>
        {generation.result.questions.length > 0 && <section className="studio-followups"><h3>A few useful questions</h3><ul>{generation.result.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></section>}
        {generation.result.context_used.length > 0 && <details className="studio-context"><summary>Context from your question</summary>{generation.result.context_used.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}</details>}
        <p className="studio-help">These are ideas to check, not verified research. No sources were opened, messages sent, or accounts changed.</p><Button type="button" variant="outline" onClick={() => void copyAnswer()}><Clipboard size={14} aria-hidden="true" />Copy this answer</Button>
      </>}
      <div className="studio-record"><Check size={14} aria-hidden="true" /><span>Saved privately · {generation.model}{generation.estimated_cost_usd !== null ? ` · Estimated model cost $${generation.estimated_cost_usd.toFixed(5)}` : " · Model cost unavailable"}</span></div><Link href="/studio" className="studio-new-question">Ask a new question <ArrowRight size={14} aria-hidden="true" /></Link>
    </Card>}

    {error && <p role="alert" className="studio-error form-error">{error}{submittedId && <>{" "}<Link href={`/studio/${submittedId}`}>Check this saved question</Link> before retrying.</>}</p>}
    <p role="status" aria-live="polite" className="studio-notice">{notice ?? ""}</p>
    {mode === "connected" && <section className="studio-history" aria-labelledby="studio-history-title"><div className="studio-history-heading"><h2 id="studio-history-title">Recent questions</h2><Button type="button" variant="ghost" disabled={loading || busy} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh history</Button></div>{view?.generations.length ? <ul>{view.generations.map((item) => <li key={item.id}><Link href={`/studio/${item.id}`} aria-current={generationId === item.id ? "page" : undefined}><span><strong>{item.result?.title ?? studioJobLabels[item.job]}</strong><span>{item.prompt.slice(0, 130)}{item.prompt.length > 130 ? "…" : ""}</span></span><span>{item.status === "complete" ? "Saved answer" : item.status === "failed" ? "Could not complete" : "Awaiting answer"}</span></Link></li>)}</ul> : <p>{loading ? "Loading your saved questions…" : "Your first question will appear here when you ask. Nothing runs in the background."}</p>}</section>}
  </div>;
}
