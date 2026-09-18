import type {
  AgentFinding,
  ApprovalRequest,
  Book,
  HumanFeedback,
} from "@/types/domain";
/** Future catalog/knowledge adapter contract. The active decision repository is connected-repository.ts. */
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
