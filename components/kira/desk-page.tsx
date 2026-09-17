"use client";
import { useState } from "react";
import { CheckCheck, Download, Lightbulb, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportWorkspace, showError, useWorkspace } from "@/lib/db/demo-store";
import { ApprovalCard } from "./approval-card";
export function DeskPage() {
  const { approvals, feedback, ready } = useWorkspace();
  const [tab, setTab] = useState("pending");
  const pending = approvals.filter((a) => a.status === "pending");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow page-kicker">
            HUMAN CONTROL / CASSANDRA’S DESK
          </span>
          <h1>
            They bring the evidence.
            <br />
            <em>You bring the instinct.</em>
          </h1>
          <p>Approve, adjust, or teach the team what only you know.</p>
        </div>
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
          <Download size={15} />
          Export decisions
        </Button>
      </div>
      <div className="inline-notice">
        <ShieldCheck size={17} />
        <span>
          Approvals record decisions in this browser. Nothing is posted, sent,
          purchased, or applied to the live catalog.
        </span>
      </div>
      <div className="desk-layout">
        <section>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="pending">
                Needs your eye ({pending.length})
              </TabsTrigger>
              <TabsTrigger value="reviewed">
                Reviewed ({approvals.length - pending.length})
              </TabsTrigger>
            </TabsList>
            {["pending", "reviewed"].map((panel) => {
              const items = approvals.filter((a) =>
                panel === "pending"
                  ? a.status === "pending"
                  : a.status !== "pending",
              );
              return (
                <TabsContent value={panel} key={panel}>
                  <div className="approval-list">
                    {items.map((a) => (
                      <ApprovalCard key={a.id} approval={a} />
                    ))}
                    {items.length === 0 && (
                      <div className="empty-state">
                        <CheckCheck size={36} />
                        <h2>
                          {panel === "pending"
                            ? "Your desk is clear."
                            : "A clean slate."}
                        </h2>
                        <p>
                          {panel === "pending"
                            ? "The minions are working. Go write. 🖤"
                            : "Your reviewed requests will stay here, along with your decisions."}
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </section>
        <aside className="desk-memory">
          <Card className="memory-card">
            <Lightbulb size={24} strokeWidth={1.2} />
            <span className="eyebrow">INSTITUTIONAL MEMORY</span>
            <h2>
              Teach the Raven.
              <br />
              <em>Keep the wisdom.</em>
            </h2>
            <p>“That performed well, but those readers aren’t my audience.”</p>
            <p className="muted">
              The nuance belongs here. Every saved lesson stays attached to its
              original recommendation.
            </p>
            <div className="memory-count">
              <strong>{feedback.length.toString().padStart(2, "0")}</strong>
              <span>
                lessons saved
                <br />
                in this browser
              </span>
            </div>
            <span className="quiet-note">
              Feedback is persistable, exportable, and designed for future
              retrieval. Demo synthesis does not yet use these lessons.
            </span>
          </Card>
        </aside>
      </div>
    </>
  );
}
