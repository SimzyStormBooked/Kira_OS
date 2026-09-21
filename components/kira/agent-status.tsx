import {
  Feather,
  MessageCircle,
  Radio,
  ScanLine,
  Target,
  Users,
} from "lucide-react";
import { agents } from "@/lib/data/seed";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "./origin-badge";
const icons = [Feather, MessageCircle, Radio, ScanLine, Target, Users];
export function AgentStatus() {
  return (
    <Card className="agent-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SPECIALISTS ON THE ROADMAP</span>
          <h2>Not running. Not pretending to.</h2>
        </div>
        <DemoBadge />
      </div>
      <p className="agent-disclaimer">
        Specialists are foundations, not running agents. Raven synthesizes
        seeded findings when you ask.
      </p>
      <div className="agent-grid">
        {agents.map((a, i) => {
          const Icon = icons[i];
          return (
            <div className="agent-status" key={a.id}>
              <div className="agent-avatar">
                <Icon size={18} strokeWidth={1.4} />
              </div>
              <div>
                <strong>{a.name}</strong>
                <small>{a.role}</small>
              </div>
              <span
                className={`agent-state ${a.mode === "deterministic" ? "waiting" : ""}`}
              >
                <span aria-hidden="true" />
                {a.mode === "deterministic"
                  ? "Demo engine · runs when you ask"
                  : "Not built yet"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
