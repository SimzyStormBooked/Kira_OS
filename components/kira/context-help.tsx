"use client";

import { ChevronDown, CircleHelp } from "lucide-react";
import { useWorkspace } from "@/lib/db/demo-store";

type HelpKind = "desk" | "raven" | "universe" | "settings";

export function ContextHelp({ kind }: { kind: HelpKind }) {
  const { mode } = useWorkspace();
  const content = {
    desk: {
      title: "How does my desk work?",
      paragraphs: [
        mode === "connected"
          ? "Save a business idea as a brief, then come back to read it with fresh eyes. Your saved briefs and decisions are available when you sign in on another device."
          : "Try the example briefs here. Your edits and decisions stay in this browser while you explore the demo.",
        "Edit adjusts the draft. Approve or Reject asks you to confirm a final decision, then keeps the read-only brief in Reviewed. You can still add a lesson. Approving does not publish, send, or purchase anything.",
        "Teach Raven saves what mattered to you with that brief, so the reason behind your decision stays with it.",
      ],
    },
    raven: {
      title: "What can I do with Raven?",
      paragraphs: [
        mode === "connected"
          ? "This is the home for recommendations about your author business. Live recommendations will need approved sources and an AI connection; they are not running yet. You can already save your own ideas at Cassandra’s Desk."
          : "Explore example recommendations and open their evidence. Bring one to Cassandra’s Desk when you want to review it. The demo uses invented findings, clearly labeled as examples.",
        "Evidence shows the source and the information behind a suggestion. Check it before deciding whether an idea fits your books and your readers.",
      ],
    },
    universe: {
      title: "What will I find in my books?",
      paragraphs: [
        "Search by title or choose a series, then open a book to explore its details. The titles and reading order come from your author website.",
        "Needs verification means a detail has not been confirmed yet. Book covers are decorative placeholders for now; approved covers and source material come next.",
      ],
    },
    settings: {
      title: "What can I change here?",
      paragraphs: [
        "See which services are connected, review the boundaries that keep your writing yours, and export a copy of your saved workspace.",
        mode === "connected"
          ? "Your saved briefs, decisions, and lessons belong to your private workspace. Your workspace connections shows the current AI and social status, with a next step when setup is needed. Ask your workspace owner for help with account access."
          : "This demo saves changes in this browser. Export first if you want to keep them before resetting the examples.",
      ],
    },
  }[kind];

  return (
    <details className="learning-context">
      <summary><CircleHelp size={15} aria-hidden="true" /><span>{content.title}</span><ChevronDown className="learning-context-chevron" size={14} aria-hidden="true" /></summary>
      <div className="learning-context-body">
        {content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </details>
  );
}
