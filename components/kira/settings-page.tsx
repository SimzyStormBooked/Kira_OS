"use client";
import Link from "next/link";
import { PasswordSettings } from "./password-settings";
import { ContextHelp } from "./context-help";
import { SetupStatus } from "./setup-status";
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
import { useWorkspace } from "@/lib/db/demo-store";
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
export function SettingsPage({ canChoosePasswordAfterLink = false }: { canChoosePasswordAfterLink?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const { ready, mode, viewerEmail, role } = useWorkspace();
  const { exportWorkspace, resetWorkspace, showError } = useWorkspace();
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
          <p>Your account, your connections, and the boundaries that keep your writing yours.</p>
        </div>
        <ShieldCheck size={32} strokeWidth={1} />
      </div>
      {mode === "connected" && <nav className="settings-quick-links" aria-label="Settings sections">
        <a href="#account-password">Your password</a>
        <a href="#setup">Your connections</a>
        <Link href="/access">Workspace access</Link>
      </nav>}
      <ContextHelp kind="settings" />
      <SetupStatus />
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
            Allowed means this app is permitted to do it — not that the feature
            is built yet. Repurposing also requires approved source material.
            Nothing here posts, sends, buys, or changes your public catalog.
          </p>
        </Card>
        <div className="settings-stack">
          <Card className="settings-card">
            <div className="section-heading">
              <h2>Connections</h2>
              <Unplug size={19} />
            </div>
              <div className="connection-row">
                <span>Private workspace storage</span>
                <span className="status-pill">
                  {mode === "connected"
                    ? "CONNECTED"
                    : "NOT CONNECTED"}
                </span>
              </div>
            <p className="quiet-note">
              {mode === "demo"
                ? "Demo mode stores decisions in this browser. A private workspace is set up by the workspace owner."
                : `Signed in as ${viewerEmail}. Decisions and lessons are saved securely in your workspace.`}
            </p>
            <div className="settings-actions">
              <Button asChild variant="outline"><Link href="/connections">Manage social connections</Link></Button>
              <Button asChild variant="ghost"><Link href="/studio">Check Ask Raven</Link></Button>
            </div>
          </Card>
          <Card className="settings-card">
            <div className="section-heading"><h2>A space you choose to share</h2><ShieldCheck size={19} /></div>
            <p>{mode === "demo" ? "You are exploring the demo. In a private workspace, a collaborator gets a clear role: viewing, editing, or reviewing decisions." : `You are ${role === "owner" ? "the owner" : role === "editor" ? "an editor" : "a viewer"} here. The workspace owner manages who can see this workspace.`}</p>
            <div className="settings-actions"><Button asChild variant="outline"><Link href="/access">{role === "owner" ? "Manage workspace access" : "View my workspace access"}</Link></Button></div>
          </Card>
          {mode === "connected" && <PasswordSettings canChoosePasswordAfterLink={canChoosePasswordAfterLink} />}
          <Card className="settings-card">
            <div className="section-heading">
              <h2>
                {mode === "demo" ? "Demo workspace" : "Private workspace"}
              </h2>
              {mode === "demo" && <DemoBadge />}
            </div>
            <p>
              {mode === "demo"
                ? "Approvals, edits, feedback, and set-aside moves are saved in this browser. Export them before switching devices or clearing site data."
                : "Download your saved briefs, decisions, source evidence, and lessons. Manuscripts, extracted book knowledge, marketing plans, Ask Raven answers and account connections are not included in this file."}
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
                Export briefs & lessons
              </Button>
              {mode === "demo" && (
                <Button
                  variant="ghost"
                  disabled={!ready}
                  onClick={() => setConfirm(true)}
                >
                  <RotateCcw size={14} />
                  Reset demo
                </Button>
              )}
            </div>
            <p className="quiet-note">
              This file is a copy for your records. It cannot be loaded back
              into KIRA OS.
            </p>
          </Card>
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this demo workspace?</DialogTitle>
            <DialogDescription>
              This removes local decisions, edited briefs, and saved lessons,
              then restores the starter data. Export first if you want a copy
              for your records. This file cannot be loaded back into KIRA OS.
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
