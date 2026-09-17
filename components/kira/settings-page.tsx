"use client";
import { useState } from "react";
import {
  Check,
  Download,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { creativeFirewall } from "@/lib/ai/policy";
import {
  exportWorkspace,
  resetWorkspace,
  showError,
  useWorkspace,
} from "@/lib/db/demo-store";
import { DemoBadge } from "./origin-badge";
const capabilityLabels: Record<keyof typeof creativeFirewall, string> = {
  ALLOW_MARKETING_ANALYSIS: "Marketing analysis",
  ALLOW_APPROVED_CONTENT_REPURPOSING: "Repurposing approved content",
  ALLOW_METADATA_GENERATION: "Metadata generation",
  ALLOW_OUTREACH_DRAFTING: "Outreach drafting",
  ALLOW_MANUSCRIPT_GENERATION: "Manuscript generation",
  ALLOW_SCENE_GENERATION: "Scene generation",
  ALLOW_CHAPTER_GENERATION: "Chapter generation",
  ALLOW_FICTION_GENERATION: "Fiction generation",
};
export function SettingsPage() {
  const [confirm, setConfirm] = useState(false);
  const { ready } = useWorkspace();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow page-kicker">WORKSPACE / SETTINGS</span>
          <h1>
            A few ground rules.
            <br />
            <em>Beautifully nonnegotiable.</em>
          </h1>
          <p>Kira is the author. AI is the business team.</p>
        </div>
        <ShieldCheck size={32} strokeWidth={1} />
      </div>
      <div className="settings-grid">
        <Card className="settings-card">
          <div className="section-heading">
            <h2>The creative firewall</h2>
            <LockKeyhole size={19} />
          </div>
          <p>
            Enforced in application policy. These boundaries cannot be switched
            off from the interface.
          </p>
          <div className="policy-list">
            {Object.entries(creativeFirewall).map(([key, allowed]) => (
              <div key={key}>
                <span>
                  {capabilityLabels[key as keyof typeof creativeFirewall]}
                </span>
                <span className={allowed ? "policy-allowed" : "policy-blocked"}>
                  {allowed ? <Check size={14} /> : <X size={14} />}{" "}
                  {allowed ? "Allowed" : "Prohibited"}
                </span>
              </div>
            ))}
          </div>
          <p className="quiet-note">
            Allowed describes policy permission, not an implemented feature.
            Repurposing also requires approved source material. All external
            execution is blocked in Phase One.
          </p>
        </Card>
        <div className="settings-stack">
          <Card className="settings-card">
            <div className="section-heading">
              <h2>Connections</h2>
              <Unplug size={19} />
            </div>
            {[
              "Supabase · Authenticated storage",
              "Instagram · Social intelligence",
              "AI provider · Live synthesis",
            ].map((c) => (
              <div className="connection-row" key={c}>
                <span>{c}</span>
                <span className="status-pill">NOT CONNECTED</span>
              </div>
            ))}
            <p className="quiet-note">
              Phase One runs entirely in demo mode. Adding environment variables
              alone does not enable live storage or agents.
            </p>
          </Card>
          <Card className="settings-card">
            <div className="section-heading">
              <h2>Demo workspace</h2>
              <DemoBadge />
            </div>
            <p>
              Approvals, edits, feedback, and set-aside moves are saved in this
              browser. Export them before switching devices or clearing site
              data.
            </p>
            <div className="settings-actions">
              <Button
                variant="outline"
                disabled={!ready}
                onClick={() => {
                  try {
                    exportWorkspace();
                  } catch (e) {
                    showError(e);
                  }
                }}
              >
                <Download size={14} />
                Export workspace
              </Button>
              <Button
                variant="ghost"
                disabled={!ready}
                onClick={() => setConfirm(true)}
              >
                <RotateCcw size={14} />
                Reset demo
              </Button>
            </div>
          </Card>
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this demo workspace?</DialogTitle>
            <DialogDescription>
              This removes local decisions, edited briefs, and saved lessons,
              then restores the starter data. Export your workspace first if you
              want to keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep my work
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                try {
                  resetWorkspace();
                  setConfirm(false);
                } catch (e) {
                  showError(e);
                }
              }}
            >
              Reset local demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
