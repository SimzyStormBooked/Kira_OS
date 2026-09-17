import type {
  Agent,
  AgentFinding,
  ApprovalRequest,
  Book,
  Evidence,
  Series,
  Source,
  TacticMemory,
  Universe,
} from "@/types/domain";

export const seedTime = "2026-09-17T12:00:00.000Z";
export function seedId(n: number) {
  return `10000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}
export const author = {
  id: seedId(1),
  name: "Kira Stanley",
  website: "https://kirastanleyauthor.com",
  instagram: "@kirastanleyauthor",
  data_origin: "manual" as const,
};
export const instagramSnapshot = {
  followers: 5447,
  posts: 880,
  data_origin: "manual" as const,
  captured_at: null,
  recorded_at: seedTime,
  note: "Supplied manually in the project brief. Snapshot date unknown; not connected to Instagram.",
};
export const sources: Source[] = [
  {
    id: seedId(10),
    name: "Synthetic reader-language sample",
    url: null,
    source_type: "synthetic",
    retrieved_at: seedTime,
    data_origin: "demo",
  },
  {
    id: seedId(11),
    name: "Synthetic campaign archive",
    url: null,
    source_type: "synthetic",
    retrieved_at: seedTime,
    data_origin: "demo",
  },
  {
    id: seedId(12),
    name: "Kira Stanley · My Alpha Team",
    url: "https://www.kirastanleyauthor.com/myalphateam",
    source_type: "website",
    retrieved_at: seedTime,
    data_origin: "public_verified",
  },
  {
    id: seedId(13),
    name: "Kira Stanley · Fantasy",
    url: "https://www.kirastanleyauthor.com/fantasy",
    source_type: "website",
    retrieved_at: seedTime,
    data_origin: "public_verified",
  },
  {
    id: seedId(14),
    name: "Kira Stanley · Ambros Triplets",
    url: "https://www.kirastanleyauthor.com/ambrostriplets",
    source_type: "website",
    retrieved_at: seedTime,
    data_origin: "public_verified",
  },
  {
    id: seedId(15),
    name: "Owner-supplied Instagram snapshot",
    url: null,
    source_type: "manual_snapshot",
    retrieved_at: seedTime,
    data_origin: "manual",
  },
];
export const evidence: Evidence[] = [
  {
    id: seedId(20),
    source_id: seedId(10),
    source: sources[0].name,
    source_type: "synthetic",
    retrieved_at: seedTime,
    excerpt_or_metric:
      "In 40 invented reader comments, 18 mention protective or devoted love interests. In an earlier invented sample of 40, 9 do. These are fabricated examples, not collected reader comments.",
    metadata: {
      sample_size: 40,
      mentions: 18,
      previous_mentions: 9,
      no_catalog_trope_claim: true,
    },
    data_origin: "demo",
  },
  {
    id: seedId(21),
    source_id: seedId(12),
    source: sources[2].name,
    source_type: "website",
    retrieved_at: seedTime,
    excerpt_or_metric:
      "The official collection lists Crazy People (#1), Agent People (#2), and Us People (#3). Only titles and ordering have been recorded; tropes remain unverified.",
    metadata: { url: sources[2].url },
    data_origin: "public_verified",
  },
  {
    id: seedId(22),
    source_id: seedId(11),
    source: sources[1].name,
    source_type: "synthetic",
    retrieved_at: seedTime,
    excerpt_or_metric:
      "A fictional backlist asset audit marks 3 of 5 example assets as needing a refresh. No actual author assets or campaign results were reviewed.",
    metadata: { assets_reviewed: 5, assets_to_review: 3 },
    data_origin: "demo",
  },
];
export const agents: Agent[] = [
  {
    id: seedId(30),
    name: "The Raven",
    role: "Executive intelligence",
    status: "WAITING",
    mode: "deterministic",
    data_origin: "demo",
  },
  {
    id: seedId(31),
    name: "Reader Voice",
    role: "Reader language & sentiment",
    status: "IDLE",
    mode: "not_connected",
    data_origin: "demo",
  },
  {
    id: seedId(32),
    name: "Social Intelligence",
    role: "Content & channel signals",
    status: "IDLE",
    mode: "not_connected",
    data_origin: "demo",
  },
  {
    id: seedId(33),
    name: "Discoverability",
    role: "Search & book discovery",
    status: "IDLE",
    mode: "not_connected",
    data_origin: "demo",
  },
  {
    id: seedId(34),
    name: "The Hunt",
    role: "Opportunity detection",
    status: "IDLE",
    mode: "not_connected",
    data_origin: "demo",
  },
  {
    id: seedId(35),
    name: "Outreach",
    role: "Relationships & conversations",
    status: "IDLE",
    mode: "not_connected",
    data_origin: "demo",
  },
];
export const findings: AgentFinding[] = [
  {
    id: seedId(40),
    agent_id: seedId(31),
    type: "audience",
    title: "Devotion is getting their attention.",
    summary:
      "Protective and devoted love-interest language appears more often in the synthetic sample. Test the positioning only after Cassandra confirms audience fit and book relevance.",
    confidence: 0.82,
    created_at: seedTime,
    evidence: [evidence[0]],
    source_ids: [seedId(10)],
    requires_human_review: true,
    status: "new",
    data_origin: "demo",
  },
  {
    id: seedId(41),
    agent_id: seedId(33),
    type: "catalog",
    title: "Give every title a source of truth.",
    summary:
      "Review the My Alpha Team catalog records and verify metadata before any marketing claims are generated.",
    confidence: 0.94,
    created_at: seedTime,
    evidence: [evidence[1]],
    source_ids: [seedId(12)],
    requires_human_review: true,
    status: "new",
    data_origin: "demo",
  },
  {
    id: seedId(42),
    agent_id: seedId(32),
    type: "tactic",
    title: "Your backlist deserves another entrance.",
    summary:
      "The synthetic asset audit suggests reviewing older creative. Inspect actual assets before deciding what needs a refresh.",
    confidence: 0.71,
    created_at: seedTime,
    evidence: [evidence[2]],
    source_ids: [seedId(11)],
    requires_human_review: true,
    status: "new",
    data_origin: "demo",
  },
];
export const series: Series[] = [
  {
    id: seedId(50),
    name: "My Alpha Team",
    source_url: sources[2].url!,
    data_origin: "public_verified",
  },
  {
    id: seedId(51),
    name: "Assassin of Onisea",
    source_url: sources[3].url!,
    data_origin: "public_verified",
    note: "Series name follows the official Fantasy page; shop navigation uses a plural variant. Canonical spelling needs author confirmation.",
  },
  {
    id: seedId(52),
    name: "Ambros Triplets",
    source_url: sources[4].url!,
    data_origin: "public_verified",
    note: "Official collection heading. Product subtitles differ between Triplets and Brothers; canonical series name needs author confirmation.",
  },
];
const catalogRows = [
  ["Crazy People", "crazy-people", 0, 1, "wine"],
  ["Agent People", "agent-people", 0, 2, "wine"],
  ["Us People", "us-people", 0, 3, "wine"],
  ["Assassin’s Refusal", "assassins-refusal", 1, 1, "olive"],
  ["Assassin’s Quest", "assassins-quest", 1, 2, "olive"],
  ["Assassin’s Capture", "assassins-capture", 1, 3, "olive"],
  ["Obsessions of the Heart", "obsessions-of-the-heart", 2, 1, "blue"],
  ["Fixation of the Mind", "fixation-of-the-mind", 2, 2, "blue"],
] as const;
export const books: Book[] = catalogRows.map(
  ([title, slug, si, order, accent], i) => ({
    id: seedId(60 + i),
    title,
    slug,
    series_id: series[si].id,
    series_order: order,
    source_id: seedId(12 + si),
    source_url: series[si].source_url,
    verified_at: seedTime,
    data_origin: "public_verified",
    verification_status: "partial",
    accent,
    description: null,
  }),
);
export const universe: Universe = {
  id: seedId(2),
  author_id: author.id,
  name: "The Kira Stanley collection",
  description:
    "An organizational container for the verified catalog. No shared fictional universe is implied.",
  data_origin: "manual",
};
export const initialApprovals: ApprovalRequest[] = [
  {
    id: seedId(80),
    recommendation_id: null,
    type: "social",
    title: "Review a reader-language direction",
    description:
      "Confirm that the positioning fits the readers Kira wants to reach.",
    draft:
      "DEMO MARKETING BRIEF\n\nExplore protective / devoted positioning using existing, approved marketing copy. First confirm audience fit with Cassandra, then verify which books actually fit. Do not invent quotes, tropes, plot points, or creative prose.\n\nDeliverable: a reviewed marketing direction. No publication is authorized by this approval.",
    status: "pending",
    evidence: [evidence[0]],
    created_at: seedTime,
    updated_at: seedTime,
    data_origin: "demo",
    version: 0,
  },
  {
    id: seedId(81),
    recommendation_id: null,
    type: "metadata",
    title: "Confirm the My Alpha Team catalog",
    description:
      "Titles and reading order are sourced. The rest still needs your eye.",
    draft:
      "CATALOG REVIEW\n\nOfficial site lists: Crazy People (#1), Agent People (#2), Us People (#3). Verify canonical names and supply approved descriptions. Characters, relationships, tropes and themes remain NEEDS VERIFICATION.\n\nApproval records this review decision only; it does not mark unknown metadata as verified.",
    status: "pending",
    evidence: [evidence[1]],
    created_at: seedTime,
    updated_at: seedTime,
    data_origin: "demo",
    version: 0,
  },
  {
    id: seedId(82),
    recommendation_id: null,
    type: "campaign",
    title: "Plan a backlist asset review",
    description: "A little attention for the books that started it all.",
    draft:
      "DEMO CAMPAIGN BRIEF\n\nInventory existing backlist marketing assets. Check source permissions, book relevance and freshness. Ask Cassandra to approve each proposed use.\n\nThe supporting asset audit is synthetic. Actual files must be supplied before any real asset review. No posting, spending, or outreach.",
    status: "pending",
    evidence: [evidence[2]],
    created_at: seedTime,
    updated_at: seedTime,
    data_origin: "demo",
    version: 0,
  },
];
export const metrics = [
  {
    label: "Readers reached",
    value: "24.8k",
    change: "+12.6%",
    detail: "Illustrative 30-day reach",
    values: [5, 8, 6, 11, 9, 12, 10, 16],
    data_origin: "demo" as const,
  },
  {
    label: "Audience growth",
    value: "+286",
    change: "+8.2%",
    detail: "Illustrative net followers",
    values: [3, 3, 5, 4, 7, 9, 8, 13],
    data_origin: "demo" as const,
  },
  {
    label: "Book clicks",
    value: "1,042",
    change: "+18.4%",
    detail: "Illustrative link clicks",
    values: [2, 5, 4, 7, 8, 7, 11, 14],
    data_origin: "demo" as const,
  },
  {
    label: "Reviews",
    value: "38",
    change: "+6",
    detail: "Invented review count",
    values: [4, 3, 7, 5, 8, 6, 8, 11],
    data_origin: "demo" as const,
  },
  {
    label: "Active campaigns",
    value: "03",
    change: "In motion",
    detail: "Illustrative campaign count",
    values: [],
    data_origin: "demo" as const,
  },
  {
    label: "Open opportunities",
    value: "07",
    change: "To explore",
    detail: "Illustrative opportunity count",
    values: [],
    data_origin: "demo" as const,
  },
];
export const tactics: TacticMemory[] = [
  {
    id: seedId(90),
    tactic: "Backlist asset refresh",
    channel: "Social",
    objective: "Keep existing marketing relevant",
    first_used: "2026-08-01T12:00:00.000Z",
    last_used: seedTime,
    historical_performance: {},
    recent_performance: {},
    performance_trend: "unknown",
    context:
      "Demo memory entry. No actual campaign results have been imported.",
    confidence: 0,
    status: "EXPERIMENTAL",
    data_origin: "demo",
    evidence: [evidence[2]],
  },
];
