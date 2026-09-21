"use client";

import { useState } from "react";
import { ArrowUpRight, BookOpen, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { analyzeAds, money, totals } from "@/lib/ads/analysis";
import type { AdsSnapshot, AdsView } from "@/lib/ads/contract";

type Props = {
  snapshot: AdsSnapshot; view: AdsView; preview: boolean; busy: boolean;
  mapBook: (campaignId: string, bookId: string | null) => void;
  saveIdea: (title: string, text: string) => void;
  inspect: (campaign: string) => void;
};
type Metric = "spend" | "clicks" | "cpc";
const labels: Record<Metric, string> = { spend: "Spend", clicks: "Link clicks", cpc: "Cost per link click" };
function change(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "Comparison unavailable";
  if (previous === 0) return current === 0 ? "No change" : "No previous baseline";
  const percent = (current / previous - 1) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}% vs previous 7 days`;
}
function dateLabel(date: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); }

function Trend({ snapshot }: { snapshot: AdsSnapshot }) {
  const [metric, setMetric] = useState<Metric>("spend"), [compare, setCompare] = useState(true), [day, setDay] = useState(6);
  const a = analyzeAds(snapshot), recent = a.daily.slice(7), previous = a.daily.slice(0, 7);
  const format = (value: number | null) => metric === "clicks" ? (value?.toLocaleString() ?? "No data") : money(value, snapshot.account.currency);
  const values = [...recent, ...(compare ? previous : [])].map(d => d[metric]).filter((v): v is number => v !== null);
  const ceiling = Math.max(...values, 1), x = (i: number) => 52 + i * 92, y = (v: number) => 195 - v / ceiling * 155;
  // Null costs break the line; zero clicks never become a fictitious zero-dollar CPC.
  const path = (days: typeof recent) => days.map((d, i) => d[metric] === null ? "" : `${i === 0 || days[i - 1][metric] === null ? "M" : "L"}${x(i)},${y(d[metric]!)}`).join(" ");
  return <Card className="ads-panel ads-trend">
    <div className="ads-section-head"><div><span className="eyebrow">FOLLOW THE CHANGE</span><h2>Your results, day by day</h2></div><label className="ads-compare-toggle"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/>Compare previous 7 days</label></div>
    <div className="ads-chart-controls" role="group" aria-label="Chart metric">{(Object.keys(labels) as Metric[]).map(key => <Button key={key} variant={metric === key ? "default" : "ghost"} aria-pressed={metric === key} onClick={() => setMetric(key)}>{labels[key]}</Button>)}</div>
    <p className="quiet-note">{metric === "cpc" ? "Spend ÷ link clicks. Gaps mean no click-cost value is available." : metric === "clicks" ? "Clicks on links in your ads. A click is not a book sale." : "Ad spend in the account currency. Higher spend is not automatically better or worse."} Select a day below to see its values.</p>
    {snapshot.data_origin === "manual_snapshot" && <p className="quiet-note">Days without rows show zero reported activity. Confirm your export includes the full date range.</p>}
    <div className="ads-chart-legend"><span><i/> {dateLabel(a.split)}–{dateLabel(snapshot.until)}</span>{compare && <span><i className="previous"/> {dateLabel(snapshot.since)}–{dateLabel(previous[6].date)}</span>}</div>
    <svg viewBox="0 0 650 230" className="ads-line-chart" role="img" aria-label={`${labels[metric]} for seven complete days${compare ? ', compared by position with the preceding seven days' : ''}. Exact values follow.`}>
      {[0, .5, 1].map(f => <g key={f}><line x1="52" x2="604" y1={y(ceiling * f)} y2={y(ceiling * f)} stroke="#465040" strokeDasharray="3 5"/><text x="46" y={y(ceiling * f) + 4} textAnchor="end" fill="#c1cab8" fontSize="11">{metric === 'clicks' ? Math.round(ceiling * f) : (ceiling * f).toFixed(ceiling < 10 ? 2 : 0)}</text></g>)}
      {compare && <path d={path(previous)} fill="none" stroke="#91a8a0" strokeWidth="2.5" strokeDasharray="6 6"/>}
      <path d={path(recent)} fill="none" stroke="#dfc58e" strokeWidth="3"/>
      <line x1={x(day)} x2={x(day)} y1="30" y2="195" stroke="#dfc58e" strokeOpacity=".35"/>
      {recent.map((d, i) => <g key={d.date}>{d[metric] !== null && <circle cx={x(i)} cy={y(d[metric]!)} r={day === i ? 6 : 3} fill="#dfc58e"/>}<text x={x(i)} y="220" textAnchor="middle" fill="#c1cab8" fontSize="11">{dateLabel(d.date)}</text></g>)}
    </svg>
    <div className="ads-day-picker" role="group" aria-label="Inspect a chart day">{recent.map((d, i) => <button key={d.date} aria-pressed={day === i} onClick={() => setDay(i)}>{dateLabel(d.date)}</button>)}</div>
    <div className="ads-day-readout" aria-live="polite"><span>{dateLabel(recent[day].date)}<strong>{format(recent[day][metric])}</strong></span>{compare && <><span aria-hidden="true">compared with</span><span>{dateLabel(previous[day].date)}<strong>{format(previous[day][metric])}</strong></span></>}</div>
    <details><summary>Read the exact daily numbers</summary><div className="ads-table-scroll"><table><caption>All 14 days · {snapshot.account.currency} · {snapshot.account.timezone_name}</caption><thead><tr><th scope="col">Date</th><th scope="col">Spend</th><th scope="col">Link clicks</th><th scope="col">Cost / click</th></tr></thead><tbody>{a.daily.map(d => <tr key={d.date}><th scope="row">{dateLabel(d.date)}</th><td>{money(d.spend, snapshot.account.currency)}</td><td>{d.clicks}</td><td>{money(d.cpc, snapshot.account.currency)}</td></tr>)}</tbody></table></div></details>
  </Card>;
}

export function AdsOverview({ snapshot, view, preview, busy, mapBook, saveIdea, inspect }: Props) {
  const [book, setBook] = useState("all");
  const links: Record<string, string> = preview ? { "201": "sample-syndicate", "202": "sample-backlist" } : view.links;
  const books = preview ? [{ id: "sample-syndicate", title: "Syndicate · sample book" }, { id: "sample-backlist", title: "Backlist · sample book" }] : view.books;
  const campaignIds = new Set(snapshot.rows.map(r => r.campaignId));
  const mappedBooks = books.filter(b => [...campaignIds].some(id => links[id] === b.id));
  const activeBook = book === "unmapped" || mappedBooks.some(b => b.id === book) ? book : "all";
  const scoped = { ...snapshot, rows: snapshot.rows.filter(r => activeBook === "all" || (activeBook === "unmapped" ? !links[r.campaignId] : links[r.campaignId] === activeBook)) };
  const a = analyzeAds(scoped), attention = a.campaigns.find(c => c.status === "Review click costs"), efficient = a.campaigns.find(c => c.status === "Lower click costs"), first = attention ?? a.campaigns[0];
  const scopeName = activeBook === "all" ? "All your campaigns" : activeBook === "unmapped" ? "Unmapped campaigns" : books.find(b => b.id === activeBook)?.title;
  const cards = [
    { label: "01 / NOTICE", title: attention ? "Click costs need a closer look." : "Start with the weekly picture.", text: attention ? `${attention.name}: ${money(attention.prior.cpc, snapshot.account.currency)} → ${money(attention.recent.cpc, snapshot.account.currency)} per link click. Check the ads behind that change.` : `${money(a.current.spend, snapshot.account.currency)} spent for ${a.current.clicks.toLocaleString()} link clicks in the latest seven days. ${a.campaigns.length ? "Open a campaign to understand its context." : "There is no reported ad activity in this selection."}` },
    { label: "02 / EXPLORE", title: efficient ? "A lower click cost worth studying." : "Give small samples room to grow.", text: efficient ? `${efficient.name} moved from ${money(efficient.prior.cpc, snapshot.account.currency)} to ${money(efficient.recent.cpc, snapshot.account.currency)} per click. Check actual sales before scaling.` : "Avoid calling a winner from a few clicks. Campaign cards explain when the comparison needs more evidence." },
    { label: "03 / KEEP IN MIND", title: a.current.purchases === null ? "Sales aren’t tracked in this report." : "Reported purchases need context.", text: a.current.purchases === null ? "That means unknown, not zero. Check your store or retailer reporting before deciding whether an ad is profitable." : `${a.current.purchases} purchases were reported. Attribution and incomplete tracking can affect this number; it is not proof of incremental sales.` },
  ];
  return <>
    <section className="ads-book-shelf" aria-label="View analytics by book"><div className="ads-section-head"><div><span className="eyebrow">A VIEW FOR EACH STORY</span><h2>See the business around your books.</h2></div><BookOpen size={24}/></div><p className="quiet-note">Choose a book to focus the summary, chart and campaigns. Map campaigns below to organize this shelf. Title tiles identify books; they are not cover artwork.</p><div className="ads-book-filters"><button aria-pressed={activeBook === "all"} onClick={() => setBook("all")}><span className="ads-book-mark">K</span><span>All books<small>{campaignIds.size} campaigns</small></span></button>{mappedBooks.map(b => <button key={b.id} aria-pressed={activeBook === b.id} onClick={() => setBook(b.id)}><span className="ads-book-mark">{b.title.slice(0, 1)}</span><span>{b.title}<small>{[...campaignIds].filter(id => links[id] === b.id).length} campaigns</small></span></button>)}{[...campaignIds].some(id => !links[id]) && <button aria-pressed={activeBook === "unmapped"} onClick={() => setBook("unmapped")}><span className="ads-book-mark">?</span><span>Not mapped yet<small>Choose a book below</small></span></button>}</div></section>
    <section aria-labelledby="ads-weekly-heading"><div className="ads-section-head"><div><span className="eyebrow">YOUR SEVEN-DAY PERSPECTIVE</span><h2 id="ads-weekly-heading">A little clarity before your next move.</h2></div><span className="ads-scope-label" role="status">{scopeName}</span></div><div className="ads-summary-grid">{cards.map(card => <Card className="ads-panel ads-summary-card" key={card.label}><span className="eyebrow">{card.label}</span><h3>{card.title}</h3><p>{card.text}</p></Card>)}</div></section>
    <div className="ads-metrics">{[
      { label: "Spend", value: money(a.current.spend, snapshot.account.currency), delta: change(a.current.spend, a.previous.spend), detail: "Ad spend, not your budget limit" },
      { label: "Link clicks", value: a.current.clicks.toLocaleString(), delta: change(a.current.clicks, a.previous.clicks), detail: "Clicks on links, not confirmed readers" },
      { label: "Cost per link click", value: money(a.current.cpc, snapshot.account.currency), delta: change(a.current.cpc, a.previous.cpc), detail: "Spend divided by link clicks" },
      { label: "Reported purchases", value: a.current.purchases ?? "Not tracked", delta: a.current.purchases === null ? "Sales data unavailable" : "Meta-attributed purchases", detail: "Unknown is different from zero" },
    ].map(m => <Card className="ads-metric" key={m.label}><span>{m.label}</span><strong className={typeof m.value === 'string' && /[a-z]/i.test(m.value) ? 'ads-text-value' : ''}>{m.value}</strong><small className="ads-metric-delta">{m.delta}</small><small>{m.detail}</small></Card>)}</div>
    <div className="ads-overview-grid"><Trend snapshot={scoped}/><Card className="ads-panel ads-next-action"><span className="eyebrow">ONE SMALL EXPERIMENT</span><h2>Your next twenty minutes.</h2>{first ? <><p className="ads-action-campaign">{first.name}</p><ol><li><strong>Look at the evidence.</strong><p>{first.explanation}</p></li><li><strong>Choose one thing to test.</strong><p>{first.nextStep}</p></li><li><strong>Keep a record.</strong><p>Save the idea, make any changes in Ads Manager yourself, then compare a later report.</p></li></ol><Button disabled={preview || busy || !view.canEdit} onClick={() => saveIdea(first.name, `${first.status}\n${first.explanation}\nNext: ${first.nextStep}`)}>Save experiment to my Desk <Check size={15}/></Button><Button variant="ghost" onClick={() => inspect(first.name)}>Inspect the ads <ArrowUpRight size={15}/></Button></> : <p>No ad activity appears in this selection. Choose another book or check the source export.</p>}</Card></div>
    <div className="ads-section-head"><div><span className="eyebrow">THE EVIDENCE BEHIND THE SUMMARY</span><h2>Your campaigns</h2></div><p className="quiet-note">{dateLabel(a.split)}–{dateLabel(snapshot.until)} versus the preceding seven days.</p></div>
    <div className="ads-campaign-grid">{a.campaigns.map(c => <Card className="ads-panel" key={c.id}><span className={`ads-status ${c.status === "Review click costs" ? "attention" : ""}`}>{c.status}</span><h3>{c.name}</h3><p className="quiet-note">Objective: {c.objective.replaceAll("_", " ").toLowerCase()}</p><div className="ads-comparison"><span>{money(c.prior.cpc, snapshot.account.currency)}</span><span aria-hidden="true">→</span><strong>{money(c.recent.cpc, snapshot.account.currency)}</strong><small>per link click</small></div><p>{c.explanation}</p><div className="ads-ad-stats"><span>{money(c.recent.spend, snapshot.account.currency)} spent</span><span>{c.recent.clicks} link clicks</span><span>{c.recent.impressions.toLocaleString()} impressions</span></div><label className="ads-label">Which book is this campaign for?<select value={preview ? "" : view.links[c.id] ?? ""} disabled={preview || busy || !view.canEdit} onChange={e => mapBook(c.id, e.target.value || null)}><option value="">Not mapped yet</option>{view.books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label><Button variant="outline" onClick={() => inspect(c.name)}>See ads & creative results <ChevronRight size={15}/></Button></Card>)}</div>
    <p className="quiet-note">Attribution: {snapshot.attribution === "not_verified" ? "not verified in this manual export" : "7-day click / 1-day view, reported on impression date"}. Comparisons describe the selected snapshot, not live results. A click-cost change is not proof of sales performance.</p>
  </>;
}

export function CreativeComparison({ snapshot, adId }: { snapshot: AdsSnapshot; adId: string }) {
  const split = new Date(Date.parse(snapshot.until + "T12:00:00Z") - 6 * 86400000).toISOString().slice(0, 10);
  const rows = snapshot.rows.filter(r => r.adId === adId);
  const current = totals(rows.filter(r => r.date >= split)), previous = totals(rows.filter(r => r.date < split));
  const enough = current.clicks >= 50 && previous.clicks >= 50 && current.impressions >= 1000 && previous.impressions >= 1000;
  return <div className="ads-creative-comparison"><span className="eyebrow">LATEST 7 DAYS / PREVIOUS 7 DAYS</span><dl><div><dt>Spend</dt><dd>{money(current.spend, snapshot.account.currency)} <small>was {money(previous.spend, snapshot.account.currency)}</small></dd></div><div><dt>Link clicks</dt><dd>{current.clicks} <small>was {previous.clicks}</small></dd></div><div><dt>Cost / link click</dt><dd>{money(current.cpc, snapshot.account.currency)} <small>was {money(previous.cpc, snapshot.account.currency)}</small></dd></div></dl><p className="quiet-note">{enough ? "Enough activity for a directional comparison. Different audiences and placements can explain differences; this is not a controlled test." : "More evidence needed: fewer than 50 clicks or 1,000 impressions in at least one period. No winner declared."}</p></div>;
}
