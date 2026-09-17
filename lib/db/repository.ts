import type {
  AgentFinding,
  ApprovalRequest,
  Book,
  HumanFeedback,
} from "@/types/domain";
/** Contract for the future authenticated Supabase adapter; the UI currently uses demo-store. */
export interface AuthorRepository {
  listBooks(authorId: string): Promise<Book[]>;
  listFindings(authorId: string): Promise<AgentFinding[]>;
  listApprovals(authorId: string): Promise<ApprovalRequest[]>;
  saveApproval(
    authorId: string,
    request: ApprovalRequest,
    expectedVersion: number,
  ): Promise<void>;
  saveFeedback(authorId: string, feedback: HumanFeedback): Promise<void>;
}
