"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildWelcomeLink } from "@/lib/auth/invitation";
import type { WorkspaceAccessDetails, WorkspaceMember } from "@/lib/auth/workspace-role";

type MemberRole = "editor" | "viewer";
type AccessCommand = { action: "grant"; email: string; role: MemberRole }
  | { action: "change"; id: string; role: MemberRole; version: number }
  | { action: "revoke"; id: string; version: number };
const roleDescriptions = {
  owner: "You can manage access, create and edit briefs, record decisions, and save lessons.",
  editor: "You can create and edit briefs, approve or reject them, and save lessons. Only the owner can manage access.",
  viewer: "You can read the workspace and export a copy. You cannot save changes or manage access.",
};

export function AccessPage({ mode, initialAccess, initialError = null, appOrigin = null }: {
  mode: "demo" | "connected"; initialAccess: WorkspaceAccessDetails | null;
  initialError?: string | null; appOrigin?: string | null;
}) {
  const router = useRouter();
  const [access, setAccess] = useState(initialAccess);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [roles, setRoles] = useState<Record<string, MemberRole>>({});
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const pending = useRef(false);
  const requestVersion = useRef(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const removedMember = useRef(false);

  const welcomeLink = appOrigin ? buildWelcomeLink(appOrigin) : "";

  async function copyWelcomeLink(member?: WorkspaceMember) {
    if (!appOrigin) return;
    try {
      await navigator.clipboard.writeText(buildWelcomeLink(appOrigin, member?.email));
      setError(null);
      setNotice(member?.email
        ? `Welcome link for ${member.email} copied. Send their password separately — it is never in the link.`
        : "Welcome link copied. The recipient still needs their own confirmed account and access here.");
    } catch {
      setNotice(null);
      setError("The link could not be copied automatically. Select the link above and copy it by hand.");
    }
    requestAnimationFrame(() => statusRef.current?.focus());
  }

  useEffect(() => {
    if (mode !== "connected") return;
    let active = true;
    const refresh = async () => {
      if (pending.current || document.visibilityState === "hidden") return;
      const version = ++requestVersion.current;
      try {
        const response = await fetch("/api/access", { cache: "no-store" });
        if (!active || version !== requestVersion.current) return;
        if (response.status === 401 || response.status === 403) {
          setAccess(null);
          router.replace("/login");
          return;
        }
        if (response.ok) setAccess(await response.json());
      } catch { /* Keep a displayed list on transient network errors; writes still reauthorize. */ }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      requestVersion.current += 1;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [mode, router]);

  async function request(command?: AccessCommand) {
    if (pending.current) return false;
    pending.current = true;
    requestVersion.current += 1;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/access", command ? {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store",
      } : { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        setAccess(null);
        router.replace("/login");
      }
      if (!response.ok) throw new Error(data.error ?? "Access could not be updated. Please try again.");
      setAccess(data);
      setRoles({});
      setNotice(command?.action === "grant" ? "Access saved. No invitation or email was sent."
        : command?.action === "change" ? "Role updated."
        : command?.action === "revoke" ? "Workspace access removed. Their saved work is retained."
        : "Access list refreshed.");
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Access could not be updated. Please try again.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
      requestAnimationFrame(() => statusRef.current?.focus());
    }
  }
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request({ action: "grant", email: email.trim(), role })) setEmail("");
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow page-kicker">WORKSPACE / ACCESS</span>
      <h1>Your trusted <em>circle.</em></h1><p>Choose who can work alongside you, and what they can do.</p></div><Users size={32} strokeWidth={1} /></div>
    <Card className="settings-card access-intro">
      <div className="section-heading"><h2>Workspace access</h2><ShieldCheck size={19} /></div>
      <p>A shared link alone does not grant access. Every person needs their own existing, confirmed account and permission for this workspace.</p>
      {mode === "demo" ? <p className="quiet-note">You are exploring a demo. Collaborator access becomes available after private setup; no real accounts are listed or changed here.</p>
        : access ? <><p className="access-your-role"><strong>Your role: {access.role}</strong></p><p>{roleDescriptions[access.role]}</p></>
          : <p>Private access details are not available right now.</p>}
      {mode === "connected" && <div className="access-share">
        <label className="form-label" htmlFor="access-welcome-link">Shareable welcome link</label>
        <Input id="access-welcome-link" readOnly value={welcomeLink} onFocus={(event) => event.currentTarget.select()} />
        <p className="quiet-note">{welcomeLink
          ? <>Send this by text or message. It opens a welcome page with a sign-in button, carries no password, and grants nothing on its own. Use <strong>Copy their link</strong> below to prefill a person&rsquo;s email address.</>
          : "Set NEXT_PUBLIC_APP_URL for this deployment to show the address you can share."}</p>
        <div className="settings-actions">
          <Button variant="outline" disabled={busy} onClick={() => void request()}><RefreshCw size={14} />Refresh access</Button>
          <Button variant="ghost" disabled={busy || !welcomeLink} onClick={() => void copyWelcomeLink()}><Copy size={14} />Copy welcome link</Button>
        </div>
      </div>}
    </Card>
    <p ref={statusRef} tabIndex={-1} role={error ? "alert" : "status"} aria-live="polite" className={error ? "form-error" : "access-status"}>{error ?? notice}</p>
    {mode === "connected" && access?.role === "owner" && <div className="access-grid">
      <Card className="settings-card"><div className="section-heading"><h2>Add an existing account</h2><UserPlus size={19} /></div>
        <p>This adds permission only. The account must already exist with confirmed email. No invitation or email is sent.</p>
        <form className="access-form" onSubmit={addMember} aria-busy={busy}>
          <label className="form-label" htmlFor="access-email">Their account email</label>
          <Input id="access-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
          <label className="form-label" htmlFor="access-new-role">Permission</label>
          <select id="access-new-role" className="access-role-select" value={role} onChange={(event) => setRole(event.target.value as MemberRole)} disabled={busy}>
            <option value="viewer">Viewer — read and export</option><option value="editor">Editor — write and make decisions</option>
          </select>
          <p className="quiet-note">Editors can approve and reject briefs as well as edit them. Viewers can read and export workspace records.</p>
          <Button type="submit" disabled={busy}>{busy ? "Saving access…" : "Grant access"}</Button>
        </form>
      </Card>
      <Card className="settings-card"><div className="section-heading"><h2>People with access</h2><Users size={19} /></div>
        <div className="access-owner"><strong>{access.owner?.email ?? "Workspace owner"}</strong><span className="status-pill">OWNER</span><p className="quiet-note">Owner access cannot be changed here.</p></div>
        {access.members.length === 0 && <p className="quiet-note">No collaborators have been added yet.</p>}
        <ul className="access-members">{access.members.map((member) => <li key={member.id} className="access-member">
          <strong>{member.email ?? "Existing account"}</strong>
          <label className="form-label" htmlFor={`access-role-${member.id}`}>Permission for {member.email ?? "this account"}</label>
          <select id={`access-role-${member.id}`} className="access-role-select" value={roles[member.id] ?? member.role} disabled={busy} onChange={(event) => setRoles((current) => ({ ...current, [member.id]: event.target.value as MemberRole }))}>
            <option value="viewer">Viewer — read and export</option><option value="editor">Editor — write and make decisions</option>
          </select>
          <div className="settings-actions"><Button variant="outline" disabled={busy || !roles[member.id] || roles[member.id] === member.role} onClick={() => void request({ action: "change", id: member.id, role: roles[member.id], version: member.version })}>Save role</Button>
            <Button variant="ghost" disabled={busy || !member.email || !welcomeLink} onClick={() => void copyWelcomeLink(member)}><Copy size={14} />Copy their link</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setError(null); removedMember.current = false; setRemoving(member); }}>Remove access</Button></div>
        </li>)}</ul>
      </Card>
    </div>}
    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}>
      <DialogContent onCloseAutoFocus={(event) => {
        if (removedMember.current) {
          event.preventDefault();
          removedMember.current = false;
          statusRef.current?.focus();
        }
      }}><DialogHeader><DialogTitle>Remove workspace access?</DialogTitle><DialogDescription>{removing?.email ?? "This account"} will lose access to this workspace. Their saved briefs, decisions, and lessons stay in place. This does not delete their account.</DialogDescription></DialogHeader>
        {error && <p role="alert" className="form-error">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Keep access</Button>
          <Button variant="destructive" disabled={busy} onClick={async () => {
            if (removing && await request({ action: "revoke", id: removing.id, version: removing.version })) {
              removedMember.current = true;
              setRemoving(null);
            }
          }}>Remove access</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
