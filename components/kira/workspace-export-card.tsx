"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/lib/db/demo-store";

export function WorkspaceExportCard() {
  const { mode, role, ready, sessionEnded, endSession, refresh } = useWorkspace();
  const allowed = mode === "connected" && role === "owner" && ready && !sessionEnded;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { requestRef.current?.abort(); }, [allowed]);
  async function download() {
    if (!allowed || busy) return;
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    const current = () => !controller.signal.aborted && requestRef.current === controller;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/workspace/export", { cache: "no-store", signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) { endSession(); return; }
      if (response.status === 403) { await refresh(); throw new Error("Only the workspace owner can download the full archive."); }
      if (!response.ok) {
        const data = await response.json();
        throw new Error(typeof data.error === "string" ? data.error : "The archive could not be prepared. Please try again.");
      }
      const expectedSize = Number(response.headers.get("X-Kira-Archive-Bytes"));
      const expectedHash = response.headers.get("X-Kira-Archive-SHA256") ?? "";
      if (response.headers.get("Content-Type") !== "application/zip" || expectedSize < 1 || expectedSize > 75 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("The archive download could not be verified. Please try again.");
      const blob = await response.blob();
      if (!current()) return;
      if (blob.size !== expectedSize) throw new Error("The download was interrupted. Please try again.");
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const actualHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
      if (!current()) return;
      if (actualHash !== expectedHash) throw new Error("The downloaded archive could not be verified. Please try again.");
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `kira-workspace-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const unavailable = Number(response.headers.get("X-Kira-Unavailable-Files") ?? "0");
      setNotice(unavailable > 0 ? `Archive prepared for download. ${unavailable} unfinished or unavailable ${unavailable === 1 ? "file is" : "files are"} listed in the manifest; their records are included.` : "Archive prepared for download. Check your browser’s downloads and keep the file private.");
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : "The archive could not be completed. Please try again.");
    } finally { if (current()) setBusy(false); }
  }
  if (mode !== "connected" || role !== "owner" || sessionEnded) return null;
  return <Card className="settings-card" id="workspace-archive">
    <div className="section-heading"><h2>Your workspace archive</h2><Download size={19} aria-hidden="true" /></div>
    <p>Download your books, original manuscripts, extracted knowledge, character profiles and ready portraits, briefs, lessons, marketing plans, Raven answers, ads reports, discovery records and saved links.</p>
    <p className="quiet-note">The ZIP includes JSON records, files and a checklist with counts and checksums. Unfinished uploads may have no file yet; the checklist names every omission. Credentials, account access and browser drafts are excluded.</p>
    <div className="settings-actions"><Button type="button" variant="outline" disabled={!allowed || busy} onClick={() => void download()}><Download size={14} aria-hidden="true" />{busy ? "Preparing your archive…" : "Download workspace archive"}</Button></div>
    <p className="quiet-note">This is a portable copy of records read during the download, not a backup from one exact moment. It cannot restore or import a workspace. Finish editing or reading first for a more consistent copy. Up to 75 MB and 20,000 records per download.</p>
    {allowed && error && <p className="form-error" role="alert">{error}</p>}
    <p className="quiet-note" role="status">{allowed ? busy ? "Collecting and checking your records and files. Keep this page open." : notice ?? "" : ""}</p>
  </Card>;
}
