import "server-only";
import type { IntelligenceProvider } from "@/lib/ai/provider";
import { demoModels } from "@/lib/ai/models";
import { prioritizeFindings } from "./raven";
export const demoProvider: IntelligenceProvider = {
  config: demoModels.raven,
  async synthesize(findings, at) {
    return prioritizeFindings(findings, at);
  },
};
