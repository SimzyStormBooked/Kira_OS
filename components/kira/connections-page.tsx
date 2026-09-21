"use client";
import { useRef, useState, type FormEvent } from "react";
import { BookOpen, Copy, ExternalLink, Link2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { connectionInputSchema, connectionLinkSchema, connectionPlatforms, platformLabels, type ConnectionLink, type ConnectionPlatform } from "@/lib/connections/schema";
import type { MetaView } from "@/lib/connections/meta-schema";

export function ConnectionsPage({ initialLinks, canEdit, mode, loadError, metaView, metaResult }: {
  initialLinks: ConnectionLink[]; canEdit: boolean; mode: "demo" | "connected"; loadError?: string;
  metaView?: MetaView; metaResult?: string;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [platform, setPlatform] = useState<ConnectionPlatform>("instagram");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copyText, setCopyText] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [meta, setMeta] = useState<MetaView>(metaView ?? { configured: false, isOwner: false, connection: null });
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaStatus, setMetaStatus] = useState("");
  const [removingLink, setRemovingLink] = useState<ConnectionLink | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const metaRequest = useRef(false);
  const activeRequest = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const linkHeadingRef = useRef<HTMLHeadingElement>(null);
  const keepLinkRef = useRef<HTMLButtonElement>(null);
  const keepMetaRef = useRef<HTMLButtonElement>(null);
  const removedLink = useRef(false);
  async function change(method: "POST" | "DELETE", body: unknown) {
    if (activeRequest.current || !canEdit) return false;
    activeRequest.current = true;
    setBusy(true); setError(null); setNotice("");
    try {
      const response = await fetch("/api/connections", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { links?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save this change.");
      setLinks(connectionLinkSchema.array().parse(result.links));
      setNotice(method === "POST" ? "Link saved. It is a shortcut; no account data is being synced." : "Link removed from your workspace.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this change.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return false;
    } finally { activeRequest.current = false; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = connectionInputSchema.safeParse({ platform, label, url });
    if (!input.success) {
      setError(input.error.issues[0]?.message || "Check the label and link.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (await change("POST", input.data)) { setLabel(""); setUrl(""); }
  }
  async function copyForNotebook() {
    try { await navigator.clipboard.writeText(copyText); setCopyStatus("Copied only the text above. Open your notebook and paste it as a source."); }
    catch { setCopyStatus("Copy is unavailable in this browser. Select the text above and copy it manually."); }
  }
  async function updateMeta(method: "POST" | "DELETE") {
    if (metaRequest.current || !meta.isOwner || !meta.configured) return;
    metaRequest.current = true; setMetaBusy(true); setMetaStatus("");
    try {
      const response = await fetch("/api/connections/meta", { method });
      const data = await response.json() as MetaView & { error?: string; providerRevoked?: boolean };
      if (!response.ok) throw new Error(data.error || "Meta could not be verified.");
      if (method === "DELETE") {
        setMeta(current => ({ ...current, connection: null }));
        setMetaStatus(data.providerRevoked ? "Meta disconnected and provider access revoked." : "KIRA’s saved authorization was removed. Check Meta’s Business Integrations settings to remove any remaining provider permission.");
      } else { setMeta(data); setMetaStatus("Account access checked successfully."); }
    } catch (cause) {
      setMetaStatus(cause instanceof Error ? cause.message : "Meta could not be verified.");
      // Refresh only public connection state after failure (for expiry/revocation).
      try { const response = await fetch("/api/connections/meta", { cache: "no-store" }); if (response.ok) setMeta(await response.json() as MetaView); } catch { /* Retain last known display. */ }
    } finally { metaRequest.current = false; setMetaBusy(false); }
  }
  const metaMessages: Record<string, string> = {
    authorized: "Meta account access was verified and saved.", cancelled: "Authorization was cancelled. No new connection was saved.",
    invalid_state: "This authorization attempt expired or was already used. Start again here.",
    permissions: "Meta did not grant the required read permissions. Check the app configuration, then reconnect.",
    no_accounts: "No accessible Facebook Page was returned. Check your Page access and linked Instagram account.",
    reconnect: "Meta authorization needs to be renewed.", owner_required: "Only the workspace owner can authorize Meta.",
    failed: "Meta could not be verified. No new connection was saved.", unavailable: "Meta could not be verified. Try again.", provider_unavailable: "Meta could not be reached. Try again.",
  };
  const authorized = meta.connection?.status === "authorized";
  return <>
    <div className="page-heading">
      <div><span className="eyebrow page-kicker">YOUR WORLD / CONNECTIONS</span><h1>Your accounts.<br /><em>Within reach.</em></h1><p>Keep your profiles and research notebooks close, with a clear view of what is connected.</p></div>
      <Link2 size={32} strokeWidth={1} aria-hidden="true" />
    </div>
    {loadError && <p className="form-error" role="alert">{loadError}</p>}
    {mode === "demo" && <p className="quiet-note">Demo preview · Sign in to a connected workspace to save your own links.</p>}
    <div className="connections-grid">
      <Card className="connections-card">
        <div className="section-heading"><h2 ref={linkHeadingRef} tabIndex={-1}>Your link library</h2><span className="connection-status status-pill">LINK ONLY · NOT SYNCED</span></div>
        <p>Saving a link creates a shortcut. It does not verify ownership, authorize KIRA, or import account data. Links are visible to your workspace members.</p>
        {links.length > 0 ? <ul className="connection-link-list">{links.map(link => <li key={link.id} className="connection-link-row">
          <div><span className="eyebrow">{platformLabels[link.platform]}</span><a href={link.url} target="_blank" rel="noopener noreferrer" className="text-link">{link.label}<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a><span className="quiet-note">Link only · Not synced</span></div>
          {canEdit && <Button variant="ghost" size="icon" disabled={busy} aria-label={`Remove ${link.label}`} onClick={() => { setError(null); removedLink.current = false; setRemovingLink(link); }}><Trash2 size={16} aria-hidden="true" /></Button>}
        </li>)}</ul> : !loadError && <p className="quiet-note">No links saved yet. Start with your Instagram or Facebook profile.</p>}
        <form onSubmit={save} className="connection-form" aria-busy={busy}>
          <div className="manual-review-field"><label className="form-label" htmlFor="connection-platform">Platform</label><select id="connection-platform" value={platform} disabled={!canEdit || busy} onChange={event => setPlatform(event.target.value as ConnectionPlatform)}>{connectionPlatforms.map(value => <option key={value} value={value}>{platformLabels[value]}</option>)}</select></div>
          <div className="manual-review-field"><label className="form-label" htmlFor="connection-label">Name this link</label><Input id="connection-label" value={label} onChange={event => setLabel(event.target.value)} placeholder="My author profile" maxLength={100} required disabled={!canEdit || busy} /></div>
          <div className="manual-review-field"><label className="form-label" htmlFor="connection-url">Profile or notebook link</label><Input id="connection-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder={platform === "notebooklm" ? "https://notebooklm.google.com/notebook/…" : `https://www.${platform}.com/…`} maxLength={2048} required disabled={!canEdit || busy} aria-describedby="connection-url-help" /><p id="connection-url-help" className="quiet-note">Copy the full link from the platform. Tracking parameters are removed.</p></div>
          {error && <p className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
          <Button type="submit" disabled={!canEdit || busy}>{busy ? "Saving…" : "Save link"}<Link2 size={15} aria-hidden="true" /></Button>
          {!canEdit && mode === "connected" && !loadError && <p className="quiet-note">Your workspace owner or an editor can add and remove links.</p>}
          <p className="quiet-note" role="status">{notice}</p>
        </form>
      </Card>
      <div className="settings-stack">
        <Card className="connections-card">
          <div className="section-heading"><h2>Instagram & Facebook</h2><span className="connection-status status-pill">{authorized ? "AUTHORIZED" : meta.connection ? "RECONNECT NEEDED" : meta.configured ? "NOT AUTHORIZED" : "SETUP PENDING"}</span></div>
          <p>Authorize read access through Meta, then check your Facebook Page and linked Instagram professional account here.</p>
          {metaResult && metaMessages[metaResult] && (metaResult !== "authorized" || authorized) && <p className="quiet-note" role="status">{metaMessages[metaResult]}</p>}
          {meta.unavailable && <p className="quiet-note">Authorization status could not be loaded. Reload to try again.</p>}
          {meta.connection && <>
            <ul className="connection-link-list">{meta.connection.accounts.map(account => <li className="connection-link-row" key={account.page_id}><div><strong>{account.page_name}</strong><span className="quiet-note">Facebook Page{account.instagram_username ? ` · Instagram @${account.instagram_username}` : " · No linked Instagram account returned"}</span></div></li>)}</ul>
            <p className="quiet-note">Last account check: {new Date(meta.connection.last_checked_at).toLocaleString("en-US", { timeZone: "America/Phoenix" })}. Authorization expires {new Date(meta.connection.expires_at).toLocaleDateString("en-US", { timeZone: "America/Phoenix" })}.</p>
            <p className="quiet-note">This verifies account access. Insights reports and automatic background sync are not enabled.</p>
          </>}
          {meta.isOwner && meta.configured && <div className="connection-meta-actions">
            <form method="post" action="/api/connections/meta/start"><Button type="submit" disabled={metaBusy}>{meta.connection ? "Reconnect with Meta" : "Connect with Meta"}<ExternalLink size={14} aria-hidden="true" /></Button></form>
            {meta.connection && <><Button variant="outline" disabled={metaBusy || !authorized} onClick={() => void updateMeta("POST")}>{metaBusy ? "Checking…" : "Check account access"}</Button><Button variant="ghost" disabled={metaBusy} onClick={() => setDisconnecting(true)}>Disconnect Meta</Button></>}
          </div>}
          {meta.isOwner && !meta.configured && <details className="connection-setup-details"><summary>Owner setup checklist</summary><ol className="connection-setup-steps"><li>Link the Instagram Business or Creator account to the intended Facebook Page.</li><li>Configure Facebook Login for Business in the Meta developer app with the five read permissions listed in the setup guide.</li><li>Add the server-only app settings and encryption key in Vercel; provision the matching capability hash in Supabase.</li><li>Register the exact callback below, along with the deauthorization and data-deletion URLs in the setup guide. Test the account before requesting wider App Review access.</li></ol><p className="quiet-note">Callback: <code>{meta.callbackUrl ?? "Set NEXT_PUBLIC_APP_URL to your canonical HTTPS app origin first."}</code></p><p className="quiet-note">Server settings: KIRA_META_APP_ID, KIRA_META_APP_SECRET, KIRA_META_LOGIN_CONFIG_ID, KIRA_META_GRAPH_VERSION, KIRA_META_CREDENTIAL_KEY. Credentials belong in Vercel’s server environment only.</p></details>}
          {!meta.isOwner && mode === "connected" && <p className="quiet-note">The workspace owner manages Meta authorization.</p>}
          <p className="quiet-note" role="status">{metaStatus}</p>
          <a href="https://www.postman.com/meta/instagram/overview" target="_blank" rel="noopener noreferrer" className="text-link">Meta’s official Instagram API guide <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
        </Card>
        <Card className="connections-card notebook-bridge">
          <div className="section-heading"><h2>A bridge to NotebookLM</h2><BookOpen size={20} aria-hidden="true" /></div>
          <p>Save a notebook link above. Then copy the notes you choose and add them in NotebookLM yourself. KIRA cannot read or sync your notebooks.</p>
          <label className="form-label" htmlFor="notebook-copy-text">Text you want to take with you</label>
          <Textarea id="notebook-copy-text" value={copyText} onChange={event => { setCopyText(event.target.value); setCopyStatus(""); }} rows={5} maxLength={20000} placeholder="Paste only material you have permission to use." aria-describedby="notebook-copy-help" />
          <p id="notebook-copy-help" className="quiet-note">This box is temporary and is not saved or sent anywhere. Copying includes only this text.</p>
          <Button variant="outline" disabled={!copyText.trim()} onClick={() => void copyForNotebook()}><Copy size={15} aria-hidden="true" />Copy for NotebookLM</Button>
          <p className="quiet-note" role="status">{copyStatus}</p>
        </Card>
      </div>
    </div>
    <Dialog open={Boolean(removingLink)} onOpenChange={(open) => { if (!open && !busy) setRemovingLink(null); }}>
      <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); keepLinkRef.current?.focus(); }} onCloseAutoFocus={(event) => {
        if (removedLink.current) {
          event.preventDefault();
          removedLink.current = false;
          linkHeadingRef.current?.focus();
        }
      }}>
        <DialogHeader><DialogTitle>Remove this saved link?</DialogTitle><DialogDescription>“{removingLink?.label ?? "This link"}” is deleted from this workspace for everyone who can see it. Nothing on {removingLink ? platformLabels[removingLink.platform] : "the platform"} changes, and no account is touched. You can save the link again at any time.</DialogDescription></DialogHeader>
        {error && <p role="alert" className="form-error">{error}</p>}
        <DialogFooter><Button ref={keepLinkRef} variant="outline" disabled={busy} onClick={() => setRemovingLink(null)}>Keep this link</Button>
          <Button variant="destructive" disabled={busy} onClick={async () => {
            if (removingLink && await change("DELETE", { id: removingLink.id })) {
              removedLink.current = true;
              setRemovingLink(null);
            }
          }}>Remove link</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={disconnecting} onOpenChange={(open) => { if (!open && !metaBusy) setDisconnecting(false); }}>
      <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); keepMetaRef.current?.focus(); }}>
        <DialogHeader><DialogTitle>Disconnect Meta?</DialogTitle><DialogDescription>This deletes the authorization KIRA has saved for your Facebook Page and linked Instagram account. Nothing on Meta is posted, changed or deleted, and you can authorize again whenever you like. Facebook Ads reporting uses a separate authorization and is not affected.</DialogDescription></DialogHeader>
        <DialogFooter><Button ref={keepMetaRef} variant="outline" disabled={metaBusy} onClick={() => setDisconnecting(false)}>Keep the connection</Button>
          <Button variant="destructive" disabled={metaBusy} onClick={async () => { await updateMeta("DELETE"); setDisconnecting(false); }}>Disconnect Meta</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
