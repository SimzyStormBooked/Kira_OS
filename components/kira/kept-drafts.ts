"use client";
import { agentRecipes, starterForRecipe } from "@/lib/data/agent-recipes";
import { studioRequestSignature } from "@/lib/ai/studio-contract";
import { keptEditFor, useWorkspace } from "@/lib/db/demo-store";

export type KeptDraft = { id: string; label: string; text: string };

/**
 * The words she has typed and not yet saved, wherever they live. Both places that can
 * take them away — a lapsed session and a deliberate sign-out — read from this list, so
 * the deliberate path can hand them back exactly like the expiry path does.
 */
export function useKeptDrafts(): KeptDraft[] {
  const {
    scratchpad,
    learnScratchpad,
    studioScratchpad,
    approvals,
    editDrafts,
    keptRegisteredDrafts,
  } = useWorkspace();
  const kept: KeptDraft[] = [];
  if (scratchpad.title.trim() || scratchpad.draft.trim())
    kept.push({
      id: "desk-idea",
      label: "Your unfinished idea at Cassandra’s Desk",
      text: [scratchpad.title.trim(), scratchpad.draft.trim()]
        .filter(Boolean)
        .join("\n\n"),
    });
  for (const recipe of agentRecipes) {
    const input = learnScratchpad.drafts[recipe.id];
    const signature = JSON.stringify({ recipeId: recipe.id, input });
    if (
      JSON.stringify(input) === JSON.stringify(starterForRecipe(recipe)) ||
      learnScratchpad.savedSignatures[recipe.id] === signature ||
      learnScratchpad.downloadedSignatures[recipe.id] === signature
    )
      continue;
    kept.push({
      id: `learn-${recipe.id}`,
      label: `Your notes in Learn & Create · ${recipe.name}`,
      text: `Name\n${input.name}\n\nWhat it should help you do\n${input.goal}\n\nWhat it should know first\n${input.context}\n\nWhat a useful result looks like\n${input.success}`,
    });
  }
  if (
    studioScratchpad.prompt.trim() &&
    studioScratchpad.savedSignature !== studioRequestSignature(studioScratchpad)
  )
    kept.push({
      id: "studio-question",
      label: "Your unsent question for Ask Raven",
      text: studioScratchpad.prompt,
    });
  for (const approval of approvals) {
    const [, unsaved] = keptEditFor(editDrafts, approval);
    if (unsaved !== null)
      kept.push({
        id: `brief-${approval.id}`,
        label: `Your edits to “${approval.title}”`,
        text: unsaved,
      });
  }
  // Forms that joined the draft guard — plan details, book metadata, notes — come back too.
  for (const registered of keptRegisteredDrafts())
    kept.push({
      id: `registered-${registered.key}`,
      label: registered.label,
      text: registered.text,
    });
  return kept;
}
