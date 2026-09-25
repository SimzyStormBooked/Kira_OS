"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Compass, Feather, FileCheck2, LayoutDashboard, ShieldCheck, GraduationCap, Lightbulb, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/db/demo-store";
import { reopenGettingStarted } from "./getting-started";

const places = [
  { name: "Mission Control", plain: "Your overview", description: "Start here to see your workspace and decide where to go next.", href: "/", icon: LayoutDashboard },
  { name: "The Universe", plain: "Your books", description: "Find a title, browse a series, and see what is known about each book.", href: "/universe", icon: BookOpen },
  { name: "Briefings", plain: "Recommendations", description: "Look at suggestions, the reasons behind them, and their supporting sources.", href: "/raven", icon: Feather },
  { name: "Cassandra’s Desk", plain: "Your decisions", description: "Save an idea, review a brief, and keep the decisions and lessons that follow.", href: "/desk", icon: FileCheck2 },
  { name: "Ask Raven", plain: "A thinking partner", description: "Ask a business question when AI is connected, then revisit the saved answer.", href: "/studio", icon: Lightbulb },
  { name: "Learn & Create", plain: "Your agent workshop", description: "Try a short lesson and turn a useful job into an assistant blueprint.", href: "/learn", icon: GraduationCap },
  { name: "Find Your Readers", plain: "Discovery & next steps", description: "Check website pages, bring in Google search reports, and review each Amazon edition. Save useful actions to your Desk.", href: "/discoverability", icon: Compass },
  { name: "Connections", plain: "Your tools, together", description: "Keep useful social links and see what is needed to authorize Instagram and Facebook.", href: "/connections", icon: Link2 },
];

export function WorkspaceGuide() {
  const { mode } = useWorkspace();
  const [open, setOpen] = useState(false);
  const sourcesId = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="learning-guide-trigger"><Compass size={16} aria-hidden="true" /><span>Guide</span></Button>
      </DialogTrigger>
      <DialogContent className="learning-guide">
        <DialogHeader>
          <span className="learning-kicker">A LITTLE HELP FINDING YOUR WAY</span>
          <DialogTitle className="learning-guide-title">Make yourself at home.</DialogTitle>
          <DialogDescription>Here is where everything lives.</DialogDescription>
        </DialogHeader>
        <div className="learning-guide-body">
          <nav className="learning-guide-places" aria-label="Workspace guide">
            {places.map(({ name, plain, description, href, icon: Icon }) => (
              <Link href={href} key={href} onClick={() => setOpen(false)} className="learning-guide-place">
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <span><strong>{name} <small>{plain}</small></strong><span>{mode === "demo" && href === "/desk" ? "Review an example brief, record a decision, and try saving a lesson." : description}</span></span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <section className="learning-guide-sources" aria-labelledby={sourcesId}>
            <h3 id={sourcesId}>A source is the “where did this come from?”</h3>
            <p>Evidence shows the original information behind a suggestion or brief. Open it to check the details before making a decision. “Needs verification” means something still needs checking.</p>
          </section>
          <div className="learning-guide-decision"><ShieldCheck size={18} aria-hidden="true" /><p><strong>You have the final say.</strong> Approve saves your decision. It does not publish, send, or purchase anything. Teach Raven keeps your note with that decision for future use.</p></div>
          <p className="learning-guide-mode">{mode === "connected"
            ? "Your saved briefs, decisions, and lessons stay in your private workspace. Ask Raven and Connections show their current setup status. Nothing runs or publishes by itself."
            : "You are exploring a demo. Example intelligence is labeled DEMO, and changes stay in this browser."}</p>
          <p className="learning-guide-mode">KIRA OS has one dark theme. It does not follow your device’s light or dark setting, and there is no light mode to switch to yet.</p>
        </div>
        <DialogFooter className="learning-guide-footer">
          {mode === "connected" && <Button asChild variant="outline"><Link href="/" onClick={() => { reopenGettingStarted(); setOpen(false); }}>Show my first steps</Link></Button>}
          <Button type="button" onClick={() => setOpen(false)}>I’ve got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
