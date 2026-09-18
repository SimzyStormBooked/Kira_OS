import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, LockKeyhole, Telescope } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export const dynamicParams = false;
const modules = {
  "reader-pulse": {
    title: "Reader Pulse",
    heading: "Listen between the lines.",
    phase: "03",
    description:
      "A future home for verified reviews, reader language, and audience understanding.",
    needs: [
      "Approved review exports",
      "Source and collection dates",
      "Cassandra’s audience guidance",
    ],
  },
  social: {
    title: "Social Intelligence",
    heading: "Less noise. More resonance.",
    phase: "04",
    description:
      "Understand which existing marketing connects with the readers you want.",
    needs: [
      "Authorized social account access",
      "Historical post and metric exports",
      "Approved content library",
    ],
  },
  discoverability: {
    title: "Discoverability",
    heading: "Make your worlds findable.",
    phase: "05",
    description:
      "Build a source-backed picture of how readers discover Kira’s books.",
    needs: [
      "Search Console access",
      "Verified catalog metadata",
      "Website page inventory",
    ],
  },
  hunt: {
    title: "The Hunt",
    heading: "Opportunity has a tell.",
    phase: "07",
    description:
      "Discover relevant creators, reviewers, and marketing opportunities with evidence.",
    needs: [
      "Opportunity criteria",
      "Audience fit guidance",
      "Verified research sources",
    ],
  },
  campaigns: {
    title: "Campaigns",
    heading: "Give every move a purpose.",
    phase: "06",
    description:
      "Plan approved campaigns and keep their evidence, assets, and learning together.",
    needs: [
      "Campaign history",
      "Approved assets and objectives",
      "Reliable result measurements",
    ],
  },
  outreach: {
    title: "Outreach",
    heading: "Relationships worth remembering.",
    phase: "07",
    description:
      "Keep a shared memory of reviewer, creator, and media relationships.",
    needs: [
      "Owner-supplied contact records",
      "Existing relationship history",
      "Human-approved outreach rules",
    ],
  },
  vault: {
    title: "The Vault",
    heading: "Nothing valuable gets forgotten.",
    phase: "02",
    description:
      "The next chapter: approved source documents, read-only manuscript reference, and a provenance-backed knowledge graph.",
    needs: [
      "Approved book metadata and covers",
      "Read-only source documents",
      "Authenticated storage and source permissions",
    ],
  },
} as const;
export function generateStaticParams() {
  return Object.keys(modules).map((module) => ({ module }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  return {
    title: modules[module as keyof typeof modules]?.title ?? "Not found",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = modules[module as keyof typeof modules];
  if (!item) notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow page-kicker">
            {item.title.toUpperCase()} / ON THE HORIZON
          </span>
          <h1>{item.heading}</h1>
          <p>{item.description}</p>
        </div>
        <span className="status-pill">PLANNED · PHASE {item.phase}</span>
      </div>
      <Card className="future-panel">
        <div className="future-art">
          <Telescope size={72} strokeWidth={0.6} />
          <span>0{Number(item.phase)}</span>
        </div>
        <div>
          <span className="eyebrow">
            THE FOUNDATION IS HERE. THE CONNECTIONS COME NEXT.
          </span>
          <h2>
            Good intelligence
            <br />
            <em>starts with real inputs.</em>
          </h2>
          <p>
            This module is a roadmap preview. No live data has been collected
            and no agent is running here.
          </p>
          <ul>
            {item.needs.map((n) => (
              <li key={n}>
                <LockKeyhole size={13} />
                {n}
              </li>
            ))}
          </ul>
          <Button asChild>
            <Link href={module === "campaigns" ? "/desk" : "/universe"}>
              {module === "campaigns"
                ? "Review saved briefs"
                : "Explore the verified catalog"}
              <ArrowUpRight size={15} />
            </Link>
          </Button>
        </div>
      </Card>
    </>
  );
}
