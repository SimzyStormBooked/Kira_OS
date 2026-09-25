import { readFile } from 'node:fs/promises';
import { applySwcTransform, detectWorkflowPatterns, shouldTransformFile } from '@workflow/builders';
import { describe, expect, it } from 'vitest';

// Route tests mock start(). Exercise the installed SDK's actual file scanner and
// compiler so an otherwise valid inline directive cannot silently skip enrollment.
describe('workflow SDK discovery and compilation', () => {
  it.each([
    { file: 'workflows/discovery.ts', workflows: ['refreshDiscoveryInBackground'], steps: ['readDiscovery'] },
    { file: 'workflows/ads-report.ts', workflows: ['refreshAdsInBackground', 'deliverPendingAdReport'], steps: ['readAds', 'sendReport'] },
    { file: 'workflows/manuscript-reading.ts', workflows: ['readManuscriptInBackground'], steps: ['readBatch'] },
  ])('enrolls and compiles $file with callable metadata', async ({ file, workflows, steps }) => {
    const source = await readFile(file, 'utf8');
    const patterns = detectWorkflowPatterns(source);
    expect(patterns.hasUseWorkflow).toBe(true);
    expect(shouldTransformFile(file, patterns)).toBe(true);
    const result = await applySwcTransform(file, source, 'client');
    for (const name of workflows) {
      expect(result.workflowManifest.workflows?.[file]?.[name]?.workflowId).toBe(`workflow//./${file.slice(0, -3)}//${name}`);
      expect(result.code).toContain(`${name}.workflowId =`);
    }
    for (const name of steps) {
      expect(result.workflowManifest.steps?.[file]?.[name]?.stepId).toBe(`step//./${file.slice(0, -3)}//${name}`);
    }
  });
});
