"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Clipboard, Download, Lightbulb, PencilRuler, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/db/demo-store";
import { agentRecipes, buildAgentBlueprint, michaelAgentStarter, starterForRecipe, type AgentBlueprint, type AgentBlueprintInput, type AgentRecipeId } from "@/lib/data/agent-recipes";

const lessons = [
  { title: "Give it a clear job and some context", text: "Start with the outcome you want, the facts it can use, and your limits. An agent is an assistant set up for a particular job; it still needs good information and your judgment.", example: "Help me explore one way to reintroduce this published book. Here is its approved description. I have two hours this week and no advertising budget." },
  { title: "Ask for options you can compare", text: "A useful assistant gives you choices and explains the tradeoffs. Ask for a small example before committing to a larger plan.", example: "Give me three approaches. Explain the effort and what each needs from me, then suggest the smallest first step." },
  { title: "Check the source before trusting the claim", text: "Ask where a fact came from. Open the source, check the date, and separate what it actually says from an interpretation. A confident answer can still need checking.", example: "Which supplied source supports this? Show the relevant passage and mark what is still uncertain." },
  { title: "Make the decision, then keep the reason", text: "Edit, approve, or reject a brief at your desk. Add a lesson about what fit your audience and what did not. Approval records your choice; it does not publish or send anything.", example: "This sounds promising, but it is not right for my readers. Keep the useful part and give me a quieter option." },
  { title: "Share access with the right role", text: "An owner manages who has access. An editor can save and change workspace items. A viewer can read them. Give each person their own account and ask your workspace owner to arrange access.", example: "Copying or downloading a blueprint gives you something to share yourself. It does not invite anyone or change workspace access." },
];

type BuiltPreview = AgentBlueprint & { signature: string };

export function LearnPage() {
  const { createManualReview, mode, ready, busy, canEdit, roleError } = useWorkspace();
  const [recipeId, setRecipeId] = useState<AgentRecipeId>("brainstorm-partner");
  const [drafts, setDrafts] = useState(() => Object.fromEntries(agentRecipes.map((recipe) => [recipe.id, starterForRecipe(recipe)])) as Record<AgentRecipeId, AgentBlueprintInput>);
  const [preview, setPreview] = useState<BuiltPreview | null>(null);
  const [savedSignatures, setSavedSignatures] = useState<Partial<Record<AgentRecipeId, string>>>({});
  const [downloadedSignatures, setDownloadedSignatures] = useState<Partial<Record<AgentRecipeId, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [michaelChoice, setMichaelChoice] = useState(false);
  const submitLock = useRef(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const michaelStarterRef = useRef<HTMLButtonElement>(null);
  const deskLinkRef = useRef<HTMLAnchorElement>(null);
  const workshopId = useId();
  const outputId = useId();
  const recipe = agentRecipes.find((item) => item.id === recipeId)!;
  const input = drafts[recipeId];
  const signature = JSON.stringify({ recipeId, input });
  const currentPreview = preview?.signature === signature ? preview : null;
  const alreadySaved = Boolean(currentPreview && savedSignatures[recipeId] === signature);
  const hasBrainstormNotes = JSON.stringify(drafts["brainstorm-partner"]) !== JSON.stringify(starterForRecipe(agentRecipes[0]));
  const hasUnsavedNotes = agentRecipes.some((item) => {
    const itemSignature = JSON.stringify({ recipeId: item.id, input: drafts[item.id] });
    return JSON.stringify(drafts[item.id]) !== JSON.stringify(starterForRecipe(item)) && savedSignatures[item.id] !== itemSignature && downloadedSignatures[item.id] !== itemSignature;
  });
  const pending = busy || saving;

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (hasUnsavedNotes) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedNotes]);

  function updateField(field: keyof AgentBlueprintInput, value: string) {
    setDrafts((previous) => ({ ...previous, [recipeId]: { ...previous[recipeId], [field]: value } }));
    setNotice(null);
    setError(null);
  }

  function applyMichaelStarter() {
    setDrafts((previous) => ({ ...previous, "brainstorm-partner": { ...michaelAgentStarter } }));
    setRecipeId("brainstorm-partner");
    setMichaelChoice(false);
    setNotice("A starting point for Michael is ready to edit. Nothing has been sent.");
    setError(null);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  function assemble(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    try {
      setPreview({ ...buildAgentBlueprint(recipeId, input), signature });
      setError(null);
      setNotice("Your blueprint is ready to review. No agent has been started.");
      requestAnimationFrame(() => outputRef.current?.focus());
    } catch {
      setError("Add a name, goal, and useful-result description within the field limits, then try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  async function saveBlueprint() {
    if (!currentPreview || pending || !ready || !canEdit || alreadySaved || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    const submitted = currentPreview;
    try {
      if (await createManualReview(submitted.title, submitted.brief)) {
        setSavedSignatures((previous) => ({ ...previous, [recipeId]: submitted.signature }));
        setNotice(mode === "demo" ? "Blueprint saved to your desk in this browser. It remains an idea for review." : "Blueprint saved to your private desk. It remains an idea for review.");
        requestAnimationFrame(() => deskLinkRef.current?.focus());
      } else {
        setError("Your blueprint could not be saved. It is still here; try again or download a copy.");
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } catch {
      setError("We could not reach your workspace. Your blueprint is still here; try again or download a copy.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }

  async function copyPrompt() {
    if (!currentPreview) return;
    try {
      await navigator.clipboard.writeText(currentPreview.prompt);
      setNotice("Prompt copied. You can paste it into an assistant you choose and review its first answer.");
      setError(null);
    } catch {
      outputRef.current?.focus();
      outputRef.current?.select();
      setNotice("The prompt is selected. Use your device’s Copy command to copy it.");
    }
  }

  function downloadBlueprint() {
    if (!currentPreview) return;
    try {
      const url = URL.createObjectURL(new Blob([currentPreview.brief], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "kira-agent-blueprint.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadedSignatures((previous) => ({ ...previous, [recipeId]: currentPreview.signature }));
      setNotice("Blueprint download started. Sharing it is a separate choice you make.");
      setError(null);
    } catch {
      setError("The download could not start. Your blueprint is still here; copy the prompt or try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  return (
    <div className="learn-page">
      <div className="page-heading">
        <div><span className="eyebrow page-kicker">LEARN & CREATE / YOUR IDEAS, YOUR WAY</span><h1>A little curiosity.<br /><em>A useful new skill.</em></h1><p>Learn how to shape an assistant around a real job, then make an idea of your own.</p></div>
        <BookOpen size={29} strokeWidth={1.3} aria-hidden="true" />
      </div>

      <section className="learn-lessons" aria-labelledby="learn-lessons-title">
        <div className="learn-section-heading"><span className="eyebrow">A FEW THINGS THAT MAKE A DIFFERENCE</span><h2 id="learn-lessons-title">Learn one thing. <em>Try it below.</em></h2></div>
        <div className="learn-lesson-list">
          {lessons.map((lesson, index) => <details className="learn-lesson" key={lesson.title}><summary><span className="learn-lesson-number">0{index + 1}</span><span>{lesson.title}</span><ChevronDown size={15} aria-hidden="true" /></summary><div className="learn-lesson-body"><p>{lesson.text}</p><blockquote>{lesson.example}</blockquote></div></details>)}
        </div>
      </section>

      <section className="learn-workshop" aria-labelledby={workshopId}>
        <div className="learn-section-heading"><span className="eyebrow"><PencilRuler size={15} aria-hidden="true" /> YOUR AGENT-IDEA WORKSHOP</span><h2 id={workshopId}>Give an idea <em>a clear job.</em></h2><p>Build a blueprint: a purpose, some context, and a prompt you can use with another assistant. This workshop assembles your notes locally; it does not run an AI agent.</p></div>

        <div className="learn-michael-starter"><div><Lightbulb size={18} aria-hidden="true" /><span>Have something in mind for Michael?</span></div><Button ref={michaelStarterRef} type="button" variant="outline" disabled={pending} onClick={() => { if (hasBrainstormNotes) setMichaelChoice(true); else applyMichaelStarter(); }}>Start an idea for Michael</Button></div>
        {michaelChoice && <div className="learn-replace-choice" role="region" aria-label="Keep your workshop notes"><p>This replaces the brainstorm recipe’s notes with an editable Michael starter. Your other recipes stay as they are.</p><div><Button type="button" variant="outline" disabled={pending} onClick={() => { setMichaelChoice(false); requestAnimationFrame(() => michaelStarterRef.current?.focus()); }}>Keep my notes</Button><Button type="button" variant="secondary" disabled={pending} onClick={applyMichaelStarter}>Use Michael starter</Button></div></div>}

        <fieldset className="learn-recipes" disabled={pending}>
          <legend>1. Choose a starting role</legend>
          <p className="learn-field-hint">Each recipe keeps its own notes while this page is open.</p>
          <div className="learn-recipe-grid">{agentRecipes.map((item) => <label key={item.id} className={`learn-recipe${item.id === recipeId ? " learn-recipe-selected" : ""}`}><input type="radio" name="agent-recipe" value={item.id} checked={item.id === recipeId} onChange={() => { setRecipeId(item.id); setMichaelChoice(false); setError(null); setNotice(null); }} /><span><strong>{item.name}</strong><span>{item.description}</span></span></label>)}</div>
        </fieldset>

        <div className="learn-workshop-grid">
          <Card className="learn-input-card">
            <form onSubmit={assemble} className="learn-form" aria-busy={pending}>
              <h3>2. Make the job your own</h3>
              <div className="learn-field"><label htmlFor="agent-blueprint-name">Give your idea a name</label><Input ref={nameRef} id="agent-blueprint-name" value={input.name} onChange={(event) => updateField("name", event.target.value)} maxLength={80} required disabled={pending} /></div>
              <div className="learn-field"><label htmlFor="agent-blueprint-goal">What should it help you do?</label><Textarea id="agent-blueprint-goal" value={input.goal} onChange={(event) => updateField("goal", event.target.value)} maxLength={1000} required rows={3} disabled={pending} /></div>
              <div className="learn-field"><label htmlFor="agent-blueprint-context">What should it know first? <span>Optional</span></label><Textarea id="agent-blueprint-context" value={input.context} onChange={(event) => updateField("context", event.target.value)} maxLength={3000} rows={4} disabled={pending} aria-describedby="agent-context-help" placeholder={recipe.contextHint} /><p id="agent-context-help" className="learn-field-hint">Use approved facts or source references. Include only information you want in the final prompt.</p></div>
              <div className="learn-field"><label htmlFor="agent-blueprint-success">What would a useful result look like?</label><Textarea id="agent-blueprint-success" value={input.success} onChange={(event) => updateField("success", event.target.value)} maxLength={1000} required rows={3} disabled={pending} /></div>
              <Button type="submit" disabled={pending}><PencilRuler size={15} aria-hidden="true" />{preview ? "Update my blueprint" : "Build my blueprint"}</Button>
              <p className="learn-field-hint">These notes stay on this page only. Save or download your blueprint before leaving.</p>
            </form>
          </Card>

          <Card className="learn-output-card" aria-labelledby={outputId}>
            <span className="eyebrow">A PLAN YOU CAN PUT TO WORK</span><h3 id={outputId}>3. Review your blueprint</h3>
            {!preview ? <div className="learn-output-empty"><PencilRuler size={30} strokeWidth={1.2} aria-hidden="true" /><p>Your blueprint will appear here. Shape the goal, add what you know, and choose Build my blueprint.</p></div> : <>
              <p className="learn-blueprint-status">{currentPreview ? "Assembled from your notes · No agent running" : "Your notes changed. Update your blueprint before saving or copying it."}</p>
              <label htmlFor="agent-blueprint-prompt" className="learn-prompt-label">Prompt to copy or adapt</label>
              <Textarea ref={outputRef} id="agent-blueprint-prompt" className="learn-prompt" value={preview.prompt} readOnly rows={15} aria-describedby="agent-prompt-help" />
              <p id="agent-prompt-help" className="learn-field-hint">Copy this prompt into an assistant you choose. Review its response before taking a next step. It includes the boundaries that keep your fiction yours.</p>
              <div className="learn-copy-actions"><Button type="button" variant="outline" disabled={!currentPreview || pending} onClick={() => void copyPrompt()}><Clipboard size={15} aria-hidden="true" />Copy prompt</Button><Button type="button" variant="outline" disabled={!currentPreview || pending} onClick={downloadBlueprint}><Download size={15} aria-hidden="true" />Download blueprint</Button></div>
              <Button type="button" className="learn-save-button" disabled={!currentPreview || pending || !ready || !canEdit || alreadySaved} onClick={() => void saveBlueprint()}>{alreadySaved ? <><Check size={15} aria-hidden="true" />Saved to my desk</> : saving ? "Saving blueprint…" : <>Save blueprint to my desk<ArrowRight size={15} aria-hidden="true" /></>}</Button>
              {!canEdit && <p className="quiet-note">{roleError ? "Saving is paused until your permissions can be checked. You can keep building, copying, and downloading your blueprint." : "With viewer access, you can build, copy, and download your blueprint. An owner or editor can save it to the desk."}</p>}
              {alreadySaved && <Link ref={deskLinkRef} href="/desk" className="learn-desk-link">Open my saved blueprint at the desk <ArrowRight size={14} aria-hidden="true" /></Link>}
              <p className="learn-save-note"><ShieldCheck size={14} aria-hidden="true" />{mode === "demo" ? "Saving records the idea in this browser." : "Saving records the idea in your private workspace."} It does not create a running agent, send anything, or change access.</p>
            </>}
          </Card>
        </div>
        {error && <p className="learn-error form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
        <p className="learn-notice" role="status" aria-live="polite">{notice ?? ""}</p>
      </section>
    </div>
  );
}
