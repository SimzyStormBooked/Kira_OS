"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Compass, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/db/demo-store";
import { reopenGettingStarted } from "./getting-started";
import { workspaceDestinations } from "@/lib/workspace-navigation";
import "./daily-workspace.css";



export function WorkspaceGuide() {
  const { mode, role } = useWorkspace();
  const places = workspaceDestinations.filter(place => place.group !== "preview" && (!place.ownerOnly || role === "owner"));
  const previews = workspaceDestinations.filter(place => place.group === "preview");
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
            {places.map(({ title, description, guideDescription, href, icon: Icon }) => (
              <Link href={href} key={href} onClick={() => setOpen(false)} className="learning-guide-place">
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <span><strong>{title} <small>{description}</small></strong><span>{mode === "demo" && href === "/desk" ? "Review an example brief, record a decision, and try saving a lesson." : guideDescription}</span></span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <details className="learning-guide-previews">
            <summary>Coming later · {previews.length} previews</summary>
            <p>These pages describe future possibilities. They do not run agents or external actions.</p>
            <nav aria-label="Workspace previews">{previews.map(({ title, guideDescription, href }) => <Link key={href} href={href} onClick={() => setOpen(false)}><strong>{title} <span>Preview</span></strong><span>{guideDescription}</span><ArrowUpRight size={14} aria-hidden="true" /></Link>)}</nav>
          </details>
          <section className="learning-guide-sources" aria-labelledby={sourcesId}>
            <h3 id={sourcesId}>A source is the “where did this come from?”</h3>
            <p>Evidence shows the original information behind a suggestion or brief. Open it to check the details before making a decision. “Needs verification” means something still needs checking.</p>
          </section>
          <div className="learning-guide-decision"><ShieldCheck size={18} aria-hidden="true" /><p><strong>You have the final say.</strong> Approve saves your decision. It does not publish, send, or purchase anything. Teach Raven keeps your note with that decision for future use.</p></div>
          <p className="learning-guide-mode">{mode === "connected"
            ? "Your saved briefs, decisions, and lessons stay in your private workspace. Ask Raven and Connections show their current setup status. Manuscript reading continues in the background after you start it. Ads reports refresh only after authorization; nothing publishes or changes spend."
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
