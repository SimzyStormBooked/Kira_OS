import { getWorkflowMetadata } from "workflow";
import { processDiscovery } from "@/lib/discovery/worker";
export async function refreshDiscoveryInBackground(id: string) {
  "use workflow";
  await readDiscovery(id, getWorkflowMetadata().workflowRunId);
}
async function readDiscovery(id: string, run: string) {
  "use step";
  await processDiscovery(id, run);
}
readDiscovery.maxRetries = 0;
