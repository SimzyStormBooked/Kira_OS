export interface ModelConfig {
  provider: "demo" | "custom";
  model: string;
  job: "raven" | "specialist";
}
export const demoModels: Record<ModelConfig["job"], ModelConfig> = {
  raven: { provider: "demo", model: "deterministic-v1", job: "raven" },
  specialist: { provider: "demo", model: "not-connected", job: "specialist" },
};
