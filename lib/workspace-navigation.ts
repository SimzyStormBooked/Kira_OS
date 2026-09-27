import { Activity, BookOpen, Compass, Feather, FileCheck2, FolderOpen, GraduationCap, LayoutDashboard, Lightbulb, Link2, Megaphone, Radio, Settings, ShieldCheck, Target, Telescope, Users, Users2, type LucideIcon } from "lucide-react";

export type WorkspaceDestination = {
  href: string;
  title: string;
  description: string;
  guideDescription: string;
  icon: LucideIcon;
  group: "workspace" | "explore" | "settings" | "preview";
  ownerOnly?: boolean;
};

/** Public page descriptions only. Shared by navigation, Guide and page search. */
export const workspaceDestinations: WorkspaceDestination[] = [
  { href: "/", title: "Mission Control", description: "Your overview", guideDescription: "Continue from a saved answer or recently updated book, then choose your next step.", icon: LayoutDashboard, group: "workspace" },
  { href: "/universe", title: "The Universe", description: "Your books & their details", guideDescription: "Open a book, check manuscript reading progress, and explore source-backed characters, story observations and marketing signals.", icon: BookOpen, group: "workspace" },
  { href: "/raven", title: "Briefings", description: "Evidence & recommendations to review", guideDescription: "Review available business recommendations, their reasoning and supporting sources.", icon: Feather, group: "workspace" },
  { href: "/characters", title: "Character Studio", description: "Your cast, portraits & notes", guideDescription: "Organize your character profiles and portraits. Connect a profile to manuscript observations, then review the source details.", icon: Users2, group: "workspace" },
  { href: "/desk", title: "Cassandra’s Desk", description: "Ideas, decisions & your guidance", guideDescription: "Save a business idea, review a shared brief, and retain your decisions and the lessons attached to them.", icon: FileCheck2, group: "workspace" },
  { href: "/discoverability", title: "Find Your Readers", description: "Website, search & listing reviews", guideDescription: "Check website pages, import Google search reports and review Amazon editions. Save useful next steps to your Desk.", icon: Compass, group: "explore" },
  { href: "/ads", title: "Ads & Next Steps", description: "Facebook results & your next experiment", guideDescription: "Import an Ads Manager CSV or use an authorized account, compare results, and review your next experiment. Reports never change ad spend.", icon: Megaphone, group: "explore" },
  { href: "/opportunities", title: "Catalog Opportunities", description: "Connections between your books", guideDescription: "Use selected book knowledge to explore connections across your catalog. Review the evidence before turning an idea into a plan.", icon: Telescope, group: "explore" },
  { href: "/plans", title: "Marketing Plans", description: "Goals, review & next steps", guideDescription: "Create and review a marketing plan around a goal and selected books. Keep proposed actions and your decisions together.", icon: Target, group: "explore" },
  { href: "/studio", title: "Ask Raven", description: "A thinking partner", guideDescription: "Bring a business question and optional book context, then return to your saved answers. Asking uses AI only when you choose to submit.", icon: Lightbulb, group: "explore" },
  { href: "/learn", title: "Learn & Create", description: "Small lessons & agent ideas", guideDescription: "Try a short lesson and shape a useful job into an assistant blueprint. A blueprint is an idea for you to review.", icon: GraduationCap, group: "explore" },
  { href: "/connections", title: "Connections", description: "Your socials & useful tools", guideDescription: "Keep useful links and review the consent and setup needed to connect supported services.", icon: Link2, group: "explore" },
  { href: "/settings", title: "Settings", description: "Your account & workspace setup", guideDescription: "Review account settings, workspace setup and available exports.", icon: Settings, group: "settings" },
  { href: "/access", title: "Workspace access", description: "People & shared access", guideDescription: "The workspace owner can review existing members and their roles. Workspace records are shared with authorized members.", icon: ShieldCheck, group: "settings", ownerOnly: true },
  { href: "/reader-pulse", title: "Reader Pulse", description: "Preview · reader language", guideDescription: "A preview of a future place for verified reviews and reader language. No review collection runs here.", icon: Activity, group: "preview" },
  { href: "/social", title: "Social", description: "Preview · marketing signals", guideDescription: "A preview of future social marketing analysis. Social metrics are not collected here.", icon: Radio, group: "preview" },
  { href: "/hunt", title: "The Hunt", description: "Preview · opportunities", guideDescription: "A preview of future creator, reviewer and opportunity research. No autonomous scouting runs here.", icon: Target, group: "preview" },
  { href: "/campaigns", title: "Campaigns", description: "Preview · campaign records", guideDescription: "A preview of a future home for approved campaigns and their results. Nothing launches here.", icon: Megaphone, group: "preview" },
  { href: "/outreach", title: "Outreach", description: "Preview · relationships", guideDescription: "A preview of future reviewer and media relationship records. No messages are sent here.", icon: Users, group: "preview" },
  { href: "/vault", title: "The Vault", description: "Preview · source documents", guideDescription: "A preview of future document and source organization. Use The Universe for the manuscript knowledge available now.", icon: FolderOpen, group: "preview" },
];
