import type { Evidence } from "@/types/domain";
export interface SeoSuggestion {
  page_url: string;
  proposed_title: string;
  reason: string;
  evidence: Evidence[];
  requires_human_review: true;
}
