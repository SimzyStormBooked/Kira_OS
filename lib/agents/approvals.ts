import {
  approvalSchema,
  feedbackSchema,
  type ApprovalRequest,
  type HumanFeedback,
} from "@/types/domain";
export type ApprovalAction =
  { type: "approve" | "reject" } | { type: "edit"; draft: string };
export function transitionApproval(
  request: ApprovalRequest,
  action: ApprovalAction,
  at: string,
  expectedVersion: number,
): ApprovalRequest {
  approvalSchema.parse(request);
  if (request.version !== expectedVersion)
    throw new Error("This request changed. Reload before reviewing.");
  if (request.status !== "pending")
    throw new Error("Only pending requests can be changed");
  const draft = action.type === "edit" ? action.draft.trim() : request.draft;
  return approvalSchema.parse({
    ...request,
    draft,
    status:
      action.type === "approve"
        ? "approved"
        : action.type === "reject"
          ? "rejected"
          : "pending",
    updated_at: at,
    version: request.version + 1,
  });
}
export function createFeedback(
  request: ApprovalRequest,
  text: string,
  at: string,
  id: string,
): HumanFeedback {
  return feedbackSchema.parse({
    id,
    approval_request_id: request.id,
    feedback: text,
    created_at: at,
    data_origin: "manual",
    scope: "demo_workspace",
  });
}
