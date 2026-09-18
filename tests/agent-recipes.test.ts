import { describe, expect, it } from "vitest";
import { agentRecipes, buildAgentBlueprint, michaelAgentStarter, starterForRecipe, type AgentRecipeId } from "@/lib/data/agent-recipes";

describe("local agent blueprint recipes", () => {
  it("produces bounded review briefs with creative and action boundaries for every recipe", () => {
    for (const recipe of agentRecipes) {
      const result = buildAgentBlueprint(recipe.id, starterForRecipe(recipe));
      expect(result.title.length).toBeLessThanOrEqual(200);
      expect(result.brief.length).toBeLessThanOrEqual(10000);
      expect(result.brief).toContain("No agent has been created, connected, or started");
      expect(result.prompt).toContain("Do not write or rewrite fiction");
      expect(result.prompt).toContain("Do not post, send messages or invitations");
      expect(result.prompt).toContain(recipe.output);
    }
  });

  it("keeps maximum-length inputs within the saved-brief limit without truncating context", () => {
    const context = "x".repeat(3000);
    const result = buildAgentBlueprint("brainstorm-partner", { name: "n".repeat(80), goal: "g".repeat(1000), context, success: "s".repeat(1000) });
    expect(result.brief.length).toBeLessThanOrEqual(10000);
    expect(result.prompt).toContain(context);
  });

  it("rejects unknown recipes and blank or oversized required fields", () => {
    const starter = starterForRecipe(agentRecipes[0]);
    expect(() => buildAgentBlueprint("untrusted-recipe" as AgentRecipeId, starter)).toThrow();
    expect(() => buildAgentBlueprint("brainstorm-partner", { ...starter, goal: "  " })).toThrow();
    expect(() => buildAgentBlueprint("brainstorm-partner", { ...starter, context: "x".repeat(3001) })).toThrow();
  });

  it("makes missing context explicit and keeps Michael's starter a shareable idea only", () => {
    expect(buildAgentBlueprint("reader-listening", starterForRecipe(agentRecipes[1])).prompt).toContain("No supporting context supplied yet");
    const result = buildAgentBlueprint("brainstorm-partner", michaelAgentStarter);
    expect(result.title).toContain("Michael");
    expect(result.brief).toContain("does not run an agent or send anything to Michael");
    expect(result.prompt).toContain("I will decide whether to share it");
  });
});
