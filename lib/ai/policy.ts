export const creativeFirewall = Object.freeze({
  ALLOW_MARKETING_ANALYSIS: true,
  ALLOW_APPROVED_CONTENT_REPURPOSING: true,
  ALLOW_METADATA_GENERATION: true,
  ALLOW_OUTREACH_DRAFTING: true,
  ALLOW_MANUSCRIPT_GENERATION: false,
  ALLOW_SCENE_GENERATION: false,
  ALLOW_CHAPTER_GENERATION: false,
  ALLOW_FICTION_GENERATION: false,
} as const);
export type Capability = keyof typeof creativeFirewall;
export function assertCapability(
  capability: Capability,
  context: { sourceApproved?: boolean } = {},
) {
  if (creativeFirewall[capability] !== true)
    throw new Error("Creative firewall: this capability is prohibited");
  if (
    capability === "ALLOW_APPROVED_CONTENT_REPURPOSING" &&
    !context.sourceApproved
  )
    throw new Error("Repurposing requires approved source material");
}
export function assertExternalExecution(): never {
  throw new Error(
    "Phase One does not execute external actions, including approved actions",
  );
}
