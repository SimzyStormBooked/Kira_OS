"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, CheckCheck, Clipboard, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { money, totals } from "@/lib/ads/analysis";
import { importAdsCsv, inspectAdsCsv, type AdsCsvInspection } from "@/lib/ads/csv";
import type { AdsSnapshot, AdsView } from "@/lib/ads/contract";
import "./import-panel.css";

const exportInstructions = "In Meta Ads Manager, select the Ads level and 14 complete days ending before today. Use the Day breakdown only. Remove Time of day, placement, age, gender and other breakdowns, and omit totals rows. Export an English CSV with Day, Ad ID, Ad name, Campaign ID, Campaign name, Amount spent (your account currency), Impressions and Link clicks. Keep IDs as text; do not round them in a spreadsheet. Confirm the ad account's time zone separately. Results or Clicks (all) cannot replace Link clicks.";
const columnTemplate = "Day,Ad ID,Ad name,Campaign ID,Campaign name,Amount spent (USD),Impressions,Link clicks\r\n";

function reportContent(snapshot: AdsSnapshot) {
  return JSON.stringify({ account: snapshot.account, since: snapshot.since, until: snapshot.until,
    rows: [...snapshot.rows].sort((a, b) => a.date.localeCompare(b.date) || a.adId.localeCompare(b.adId)) });
}

type Props = {
  view: AdsView; busy: boolean; preview: boolean;
  onImport: (data: FormData) => Promise<void>;
  onOpenReport: (id: string) => void;
};

export function AdsImportPanel({ view, busy, preview, onImport, onOpenReport }: Props) {
  const last = view.reports.find(r => r.snapshot.data_origin === "manual_snapshot")?.snapshot;
  const [fields, setFields] = useState(() => ({ accountName: last?.account.name ?? "", timezone: last?.account.timezone_name ?? "", currency: last?.account.currency ?? "", since: "", until: "" }));
  const [file, setFile] = useState<File | null>(null), [text, setText] = useState("");
  const [inspection, setInspection] = useState<AdsCsvInspection | null>(null);
  const [review, setReview] = useState<AdsSnapshot | null>(null), [duplicate, setDuplicate] = useState<string | null>(null);
  const [reading, setReading] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const readId = useRef(0), saveLock = useRef(false), reviewHeading = useRef<HTMLHeadingElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const disabled = busy || preview || !view.canEdit || !view.available || Boolean(view.connection?.selected);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => () => { readId.current++; }, []);

  function edit(name: keyof typeof fields, value: string) {
    setFields(current => ({ ...current, [name]: value })); setReview(null); setDuplicate(null); setError("");
  }
  async function chooseFile(chosen: File | null) {
    const selection = ++readId.current;
    setFile(null); setText(""); setReview(null); setDuplicate(null); setInspection(null); setError(""); setReading(false);
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith(".csv") || chosen.size > 2_000_000) { setError("Choose a CSV file under 2 MB. Export it from Ads Manager; renaming another file will not convert it."); return; }
    setReading(true);
    try {
      const content = await chosen.text();
      if (selection !== readId.current) return;
      const result = inspectAdsCsv(content);
      setFile(chosen); setText(content); setInspection(result);
      setFields(current => ({ ...current, since: result.since ?? "", until: result.until ?? "", currency: result.currency ?? current.currency }));
    } catch { if (selection === readId.current) setError("This file could not be read. Try choosing the original CSV export again."); }
    finally { if (selection === readId.current) setReading(false); }
  }
  function reviewImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setDuplicate(null);
    if (disabled || reading || !file || inspection?.issues.length) return;
    try {
      const snapshot = importAdsCsv(text, fields.since, fields.until, fields.timezone, fields.currency, fields.accountName);
      const signature = reportContent(snapshot);
      const existing = view.reports.find(r => r.snapshot.data_origin === "manual_snapshot" && reportContent(r.snapshot) === signature);
      if (existing) { setDuplicate(existing.id); setReview(null); return; }
      setReview(snapshot);
    } catch (e) { setError(e instanceof Error ? e.message : "Check the export and account settings, then try again."); }
  }
  async function save() {
    if (disabled || !review || !file || saveLock.current) return;
    saveLock.current = true;
    setError("");
    const data = new FormData(); data.set("file", file);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    try { await onImport(data); }
    catch (e) { setError(e instanceof Error ? e.message : "Your report could not be saved. The file is still here; try again."); }
    finally { saveLock.current = false; }
  }
  async function copyInstructions() {
    try { await navigator.clipboard.writeText(exportInstructions); setCopied(true); }
    catch { setError("Copy was unavailable. Open Export instructions below and select the text to copy it."); }
  }
  const values = review ? totals(review.rows) : null;
  return <Card className="ads-panel ads-import-panel" id="ads-import-panel" tabIndex={-1} aria-labelledby="ads-import-title">
    <div className="ads-import-heading"><div><span className="eyebrow">A SMALL HABIT. A CLEARER PICTURE.</span><h2 id="ads-import-title">Your next report starts here.</h2><p>Bring a fresh export whenever you want to check in. KIRA keeps each saved report so you can return to it.</p></div><FileSpreadsheet size={32} aria-hidden="true" /></div>
    <ol className="ads-import-steps" aria-label="Import steps"><li aria-current={!review ? "step" : undefined}><span>1</span>Choose your export</li><li aria-current={review ? "step" : undefined}><span>2</span>Review the numbers</li><li><span>3</span>Find your next move</li></ol>
    {preview && <p className="quiet-note">Return to your data to import a real report.</p>}
    {view.connection?.selected && <p className="quiet-note">A connected account is selected. Use Refresh my ads for that account; manual imports are available when no live account is selected.</p>}
    {!view.canEdit && <p className="quiet-note">An owner or editor can add reports. You can explore saved reports below.</p>}
    {error && <p ref={errorRef} tabIndex={-1} className="library-error" role="alert">{error}</p>}
    {!review ? <form onSubmit={reviewImport} className="ads-import-form">
      <fieldset disabled={disabled || reading}>
        <div className={`ads-import-drop${dragging ? " is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!disabled && !reading) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled && !reading) { if (event.dataTransfer.files.length !== 1) setError("Choose one CSV export at a time."); else void chooseFile(event.dataTransfer.files[0]); } }}>
          <UploadCloud size={28} aria-hidden="true"/><label htmlFor="ads-import-file">CSV export</label><p>Drop your Ads Manager file here, or choose it below.</p><Input id="ads-import-file" type="file" accept=".csv,text/csv" onChange={event => { void chooseFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }}/><small>{file ? `${file.name} · ${(file.size / 1000).toFixed(0)} KB` : "CSV only · up to 2 MB · 14 complete days"}</small>
        </div>
        {reading && <p role="status">Reading your export…</p>}
        {inspection && <div className="ads-import-file-check" aria-live="polite"><strong>{inspection.issues.length ? "A small export adjustment is needed" : "Your file is ready to review"}</strong><p>{inspection.rowCount.toLocaleString()} rows · {inspection.adCount} ads · {inspection.campaignCount} campaigns · {inspection.observedDayCount} dates with rows</p>{inspection.issues.length > 0 && <ul>{inspection.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>}
        <div className="ads-import-account"><div><h3>Confirm the account details</h3><p>{last ? "We’ve filled in the account settings from your last manual report. Change them if this export is for another account." : "Use the currency and time zone shown in your ad account. After saving, these settings will be ready for next time."}</p></div>
          <label>Account label<Input value={fields.accountName} onChange={e => edit("accountName", e.target.value)} required maxLength={200} placeholder="My Facebook ad account" /></label>
          <label>Account timezone<Input aria-label="Account timezone" value={fields.timezone} onChange={e => edit("timezone", e.target.value)} list="ads-import-timezones" required maxLength={100} placeholder="Confirm in Ads Manager" aria-describedby="ads-import-timezone-help"/><small id="ads-import-timezone-help">Use the account’s setting, which can differ from where you live.</small></label>
          <datalist id="ads-import-timezones">{["America/Phoenix", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Europe/London", "UTC"].map(zone => <option key={zone} value={zone}/>)}</datalist>
          <label>Currency (three-letter code)<Input value={fields.currency} onChange={e => edit("currency", e.target.value.toUpperCase())} placeholder="USD" required pattern="[A-Z]{3}" maxLength={3}/></label>
        </div>
        <div className="ads-import-dates"><label>First day<Input type="date" value={fields.since} onChange={e => edit("since", e.target.value)} required/></label><label>Last day (14 days total)<Input type="date" value={fields.until} onChange={e => edit("until", e.target.value)} required/></label></div>
        <p className="quiet-note">Dates and currency are filled from the file when available. Confirm the full export window; an absent day does not prove zero activity. The two seven-day windows use your account’s time zone.</p>
        <Button disabled={!file || Boolean(inspection?.issues.length) || reading} type="submit">Review my import <ArrowRight size={16} aria-hidden="true"/></Button><p className="quiet-note">Your file stays in this browser until you choose Save report.</p>
      </fieldset>
    </form> : <section className="ads-import-preview" aria-label="Import preview">
      <div className="ads-import-preview-heading"><CheckCheck size={24} aria-hidden="true"/><div><span className="eyebrow">CHECKED IN YOUR BROWSER · NOT SAVED YET</span><h3 ref={reviewHeading} tabIndex={-1}>Ready to add this report?</h3><p>{file?.name}</p></div></div>
      <p><strong>{review.account.name}</strong><br/>{review.since} – {review.until} · {review.account.currency} · {review.account.timezone_name}</p>
      <div className="ads-import-numbers"><div><span>Reported spend</span><strong>{money(values!.spend, review.account.currency)}</strong></div><div><span>Link clicks</span><strong>{values!.clicks.toLocaleString()}</strong></div><div><span>Cost per link click</span><strong>{money(values!.cpc, review.account.currency)}</strong></div></div>
      <p className="quiet-note">Totals above cover the full export window. The dashboard compares the latest seven days with the preceding seven. {inspection?.observedDayCount} dates have rows; {inspection?.adCount} ads and {inspection?.campaignCount} campaigns are included.</p>
      {!!inspection?.warnings.length && <ul>{inspection.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      <div className="ads-import-outcome"><Check size={18} aria-hidden="true"/><p>A new manual report will be saved. Your existing reports stay intact. Sales attribution, creative images and automatic syncing are not included in this CSV.</p></div>
      <div className="ads-actions"><Button disabled={disabled} onClick={() => void save()}>{busy ? "Saving your report…" : "Save report & view dashboard"}<ArrowRight size={16} aria-hidden="true"/></Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Edit import details</Button></div>
    </section>}
    {duplicate && <div className="ads-import-file-check" role="status"><strong>This report is already in your recent history.</strong><p>The account details, dates and ad rows match a saved report.</p><Button variant="outline" onClick={() => onOpenReport(duplicate)}>Open saved report</Button></div>}
    <details className="ads-import-help"><summary>Export instructions & a reusable checklist</summary><p>{exportInstructions}</p><div className="ads-actions"><Button type="button" variant="outline" onClick={() => void copyInstructions()}><Clipboard size={15} aria-hidden="true"/>{copied ? "Instructions copied" : "Copy export instructions"}</Button><a download="KIRA-ad-export-columns.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(columnTemplate)}`}>Download column template</a></div><p className="quiet-note">The template contains headings only. Replace USD with your account currency when needed. Nothing is sent to your ad manager.</p></details>
  </Card>;
}
