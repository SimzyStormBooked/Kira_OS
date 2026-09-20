import { getWorkflowMetadata } from "workflow";
import { processBackgroundBatch } from "@/lib/manuscripts/background";

export async function readManuscriptInBackground(jobId: string) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  for (let wave = 0; wave < 150; wave++) {
    const states = await Promise.all([
      readBatch(jobId, workflowRunId, wave * 2),
      readBatch(jobId, workflowRunId, wave * 2 + 1),
    ]);
    if (states.some(state => state !== "running")) return;
  }
}
async function readBatch(jobId: string, runId: string, sequence: number) {
  "use step";
  return processBackgroundBatch(jobId, runId, sequence);
}
readBatch.maxRetries = 0;
