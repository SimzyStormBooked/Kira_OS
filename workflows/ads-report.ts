import { getWorkflowMetadata } from "workflow";
import { processAdsReport } from "@/lib/ads/worker";
import { deliverAdReport } from "@/lib/ads/delivery";
export async function refreshAdsInBackground(jobId: string) {
  "use workflow";
  const ids = await readAds(jobId, getWorkflowMetadata().workflowRunId);
  for (const id of ids) await sendReport(id);
}
async function readAds(id: string, run: string) { "use step"; return processAdsReport(id, run); }
readAds.maxRetries = 0;
async function sendReport(id: string) { "use step"; return deliverAdReport(id); }
sendReport.maxRetries = 0;

export async function deliverPendingAdReport(id: string) {
  "use workflow";
  return sendReport(id);
}
