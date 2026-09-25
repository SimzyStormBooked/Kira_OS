"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Compass, Info, MousePointer2, Target } from "lucide-react";
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
type Analysis = ReturnType<typeof analyzeAds>;
type Campaign = Analysis["campaigns"][number];
const labels: Record<Metric, string> = { spend: "Spend", clicks: "Link clicks", cpc: "Cost per link click" };

function change(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "Comparison unavailable";
  if (previous === 0) return current === 0 ? "No change" : "No previous baseline";
  const percent = (current / previous - 1) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}% vs previous 7 days`;
}
function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
function statusClass(status: string) {
  return status === "Review click costs" ? "attention" : status === "Lower click costs" ? "lower" : "";
}

function Trend({ snapshot, analysis: a }: { snapshot: AdsSnapshot; analysis: Analysis }) {
  const [metric, setMetric] = useState<Metric>("cpc");
  const [compare, setCompare] = useState(true);
  const [day, setDay] = useState(6);
  const dayButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const chartId = useId();
  const sourceDates = new Set(snapshot.rows.map(row => row.date));
  // Missing source rows are a gap, including for spend and clicks. Reported zeroes remain zeroes.
  const daily = a.daily.map(d => ({ ...d, reported: sourceDates.has(d.date), value: sourceDates.has(d.date) ? d[metric] : null }));
  const recent = daily.slice(7), previous = daily.slice(0, 7);
  const format = (value: number | null) => value === null ? "Unavailable" : metric === "clicks" ? value.toLocaleString() : money(value, snapshot.account.currency);
  const values = [...recent, ...(compare ? previous : [])].map(d => d.value).filter((v): v is number => v !== null);
  const ceiling = Math.max(...values, 1), x = (i: number) => 56 + i * 92, y = (v: number) => 201 - v / ceiling * 165;
  const path = (days: typeof recent) => days.map((d, i) => d.value === null ? "" : `${i === 0 || days[i - 1].value === null ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const currentValue = recent.some(d => d.reported) ? a.current[metric] : null;
  const previousValue = previous.some(d => d.reported) ? a.previous[metric] : null;
  function moveDay(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % 7 : event.key === "ArrowLeft" ? (index + 6) % 7 : event.key === "Home" ? 0 : event.key === "End" ? 6 : null;
    if (next === null) return;
    event.preventDefault();
    setDay(next);
    dayButtons.current[next]?.focus();
  }
  return <Card className="ads-panel ads-trend">
    <div className="ads-section-head"><div><span className="eyebrow">THE SHAPE OF YOUR WEEK</span><h2>Your results, day by day</h2></div><span className="ads-chart-unit">{snapshot.account.currency}</span></div>
    <div className="ads-chart-controls" role="group" aria-label="Chart metric">{(Object.keys(labels) as Metric[]).map(key => <Button key={key} variant="ghost" aria-pressed={metric === key} onClick={() => setMetric(key)}>{labels[key]}</Button>)}</div>
    <div className="ads-chart-value"><div><strong>{format(currentValue)}</strong><span>{metric === "cpc" ? "per reported link click" : `reported ${metric === "spend" ? "spend" : "link clicks"}`}</span></div><span>{change(currentValue, previousValue)}</span></div>
    <div className="ads-chart-legend"><span><i/>{dateLabel(a.split)}–{dateLabel(snapshot.until)}</span><label className="ads-compare-toggle"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/><i className="previous"/>Compare previous 7 days</label></div>
    <svg viewBox="0 0 650 228" className="ads-line-chart" role="img" aria-label={`${labels[metric]} for the latest seven days${compare ? ", compared by day position with the preceding seven days" : ""}. Gaps have no available value. Exact values follow.`}>
      <defs><linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dcc491" stopOpacity=".18"/><stop offset="100%" stopColor="#dcc491" stopOpacity="0"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map(f => <g key={f}><line x1="56" x2="608" y1={y(ceiling * f)} y2={y(ceiling * f)} stroke="#343831" strokeDasharray={f ? "3 5" : undefined}/><text x="45" y={y(ceiling * f) + 4} textAnchor="end" fill="#b8bdb0" fontSize="11">{metric === "clicks" ? Math.round(ceiling * f) : (ceiling * f).toFixed(ceiling < 10 ? 2 : 0)}</text></g>)}
      {recent.every(d => d.value !== null) && <path d={`${path(recent)} L${x(6)},201 L${x(0)},201 Z`} fill={`url(#${chartId})`}/>}
      {compare && <path d={path(previous)} fill="none" stroke="#88a99c" strokeWidth="2.5" strokeDasharray="5 6"/>}
      <path d={path(recent)} fill="none" stroke="#e1c88f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1={x(day)} x2={x(day)} y1="25" y2="201" stroke="#dcc491" strokeOpacity=".38"/>
      {recent.map((d, i) => <g key={d.date}>{compare && previous[i].value !== null && <circle cx={x(i)} cy={y(previous[i].value!)} r={day === i ? 4 : 2} fill="#88a99c"/>}{d.value !== null && <><circle cx={x(i)} cy={y(d.value)} r={day === i ? 10 : 0} fill="#e1c88f" fillOpacity=".13"/><circle cx={x(i)} cy={y(d.value)} r={day === i ? 5 : 3} fill="#e1c88f"/></>}<text x={x(i)} y="223" textAnchor="middle" fill="#b8bdb0" fontSize="11">{dateLabel(d.date)}</text></g>)}
    </svg>
    <div className="ads-day-picker" role="group" aria-label="Inspect a chart day">{recent.map((d, i) => <button key={d.date} ref={node => { dayButtons.current[i] = node; }} tabIndex={day === i ? 0 : -1} aria-pressed={day === i} onKeyDown={event => moveDay(event, i)} onClick={() => setDay(i)}>{dateLabel(d.date)}</button>)}</div>
    <div className="ads-day-readout" aria-live="polite"><span><small>{dateLabel(recent[day].date)} · latest week</small><strong>{recent[day].reported ? format(recent[day].value) : "No rows reported"}</strong></span>{compare && <><ArrowRight aria-hidden="true" size={17}/><span><small>{dateLabel(previous[day].date)} · previous week</small><strong>{previous[day].reported ? format(previous[day].value) : "No rows reported"}</strong></span></>}</div>
    <p className="quiet-note ads-chart-help">Select a date or use the arrow keys to explore. {metric === "cpc" ? "Click cost is spend ÷ link clicks. No clicks means no cost-per-click value." : metric === "clicks" ? "Link clicks are not confirmed readers or book sales." : "Spend describes reported activity, not your budget limit."} Gaps have no available value; missing rows are not observed zeroes.</p>
    <details><summary>Read the exact daily numbers</summary><div className="ads-table-scroll" tabIndex={0} role="region" aria-label="Exact daily ad numbers"><table><caption>Source rows across 14 days · {snapshot.account.currency} · {snapshot.account.timezone_name}</caption><thead><tr><th scope="col">Date</th><th scope="col">Spend</th><th scope="col">Link clicks</th><th scope="col">Cost / click</th></tr></thead><tbody>{daily.map(d => <tr key={d.date}><th scope="row">{dateLabel(d.date)}</th>{d.reported ? <><td>{money(d.spend, snapshot.account.currency)}</td><td>{d.clicks.toLocaleString()}</td><td>{money(d.cpc, snapshot.account.currency)}</td></> : <td colSpan={3}>No rows reported</td>}</tr>)}</tbody></table></div></details>
  </Card>;
}

function experiments(campaign: Campaign, snapshot: AdsSnapshot, split: string) {
  const currentRows = snapshot.rows.filter(row => row.campaignId === campaign.id && row.date >= split);
  const priorRows = snapshot.rows.filter(row => row.campaignId === campaign.id && row.date < split);
  const enough = campaign.status !== "More data needed";
  const baseline = `${currentRows.length ? money(campaign.recent.cpc, snapshot.account.currency) : "No rows reported"} per link click across ${campaign.recent.clicks.toLocaleString()} reported clicks; previous period: ${priorRows.length ? money(campaign.prior.cpc, snapshot.account.currency) : "no rows reported"} across ${campaign.prior.clicks.toLocaleString()} clicks.`;
  return [
    { id: "delivery", label: enough ? "Review delivery" : "Build the baseline", title: enough ? "Find where the change happened." : "Make the next comparison useful.",
      why: baseline,
      what: enough ? "Inspect the ads and placement breakdown in Ads Manager. Identify which changed before deciding what to adjust; a cost change alone cannot explain why." : "Check that your report includes the full date range and the intended ads. Confirm the destination and tracking, then collect more evidence before choosing a winner.",
      measure: "Use comparable seven-day windows. Aim for at least 50 link clicks and 1,000 impressions in each; that supports a directional review, not a statistically proven result." },
    { id: "creative", label: "Test a cover detail", title: "One small change, a clearer comparison.",
      why: enough ? `${baseline} The report does not establish which creative choice caused the difference.` : "This campaign needs more evidence before its creative can be judged. Prepare a test idea now, then verify the baseline before running it.",
      what: "Consider one alternative crop of an existing, approved cover image. Keep the audience, copy and destination steady so the change is easier to interpret.",
      measure: `Record the current baseline (${currentRows.length ? money(campaign.recent.cpc, snapshot.account.currency) : "unavailable"} per link click), then compare click cost and actual sales or lead reporting over a comparable period. Click cost alone does not establish success.` },
    { id: "tracking", label: "Check the book journey", title: "Follow the click all the way through.",
      why: campaign.recent.purchases === null ? "Purchase data is unavailable for this campaign. The report can describe clicks, but cannot tell you whether they became book sales." : "Reported purchases reflect attribution and may have incomplete coverage. They cannot establish that an ad caused additional sales.",
      what: "Follow the existing ad link to its destination. Confirm it reaches the intended book, then check which sales or lead events your store or retailer reporting can actually attribute.",
      measure: `Record the destination and tracking status alongside ${campaign.recent.clicks.toLocaleString()} reported link clicks. Keep separately sourced sales figures distinct from Meta attribution.` },
  ];
}

function NextExperiment({ snapshot, analysis, preview, busy, view, saveIdea, inspect }: Omit<Props, "mapBook"> & { analysis: Analysis }) {
  const [campaignId, setCampaignId] = useState("");
  const [choice, setChoice] = useState("delivery");
  const campaign = analysis.campaigns.find(c => c.id === campaignId) ?? analysis.campaigns.find(c => c.status === "Review click costs") ?? analysis.campaigns[0];
  const options = campaign ? experiments(campaign, snapshot, analysis.split) : [];
  const selected = options.find(option => option.id === choice) ?? options[0];
  return <Card className="ads-panel ads-next-action">
    <div className="ads-next-heading"><span className="ads-icon-disc"><Compass size={21}/></span><span className="eyebrow">FROM INSIGHT TO AN IDEA</span></div>
    <h2>Your next twenty minutes.</h2>
    {campaign && selected ? <>
      <label className="ads-label ads-experiment-campaign">Campaign to explore<select value={campaign.id} onChange={event => setCampaignId(event.target.value)}>{analysis.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="ads-experiment-choices" role="group" aria-label="Choose an experiment">{options.map(option => <button key={option.id} aria-pressed={selected.id === option.id} onClick={() => setChoice(option.id)}>{option.label}</button>)}</div>
      <h3 className="ads-experiment-title">{selected.title}</h3>
      <dl className="ads-experiment-steps"><div><dt><span>01</span> Why this</dt><dd>{selected.why}</dd></div><div><dt><span>02</span> What to try</dt><dd>{selected.what}</dd></div><div><dt><span>03</span> What to measure</dt><dd>{selected.measure}</dd></div></dl>
      <div className="ads-experiment-actions"><Button disabled={preview || snapshot.data_origin === "demo" || busy || !view.canEdit || !view.available} onClick={() => saveIdea(campaign.name, `${selected.title}\nCampaign: ${campaign.name} (${campaign.id})\nSource window: ${snapshot.since}–${snapshot.until}\nWhy: ${selected.why}\nWhat to try: ${selected.what}\nWhat to measure: ${selected.measure}`)}>Save experiment to my Desk <Check size={15}/></Button><Button variant="ghost" onClick={() => inspect(campaign.name)}>Inspect the ads <ArrowUpRight size={15}/></Button></div>
      <p className="quiet-note ads-experiment-footnote">{preview || snapshot.data_origin === "demo" ? "Sample ideas are for exploring this dashboard and cannot be saved." : !view.canEdit ? "You can explore the evidence. An owner or editor can save an experiment." : "Saves a review note. You decide what to change in Ads Manager."}</p>
    </> : <div className="ads-inline-empty"><Target size={30}/><p>No campaign rows appear in this selection. Choose another book or check the source report to find a useful starting point.</p></div>}
  </Card>;
}

export function AdsOverview({ snapshot, view, preview, busy, mapBook, saveIdea, inspect }: Props) {
  const [book, setBook] = useState("all");
  const isSample = preview || snapshot.data_origin === "demo";
  const links: Record<string, string> = isSample ? { "201": "sample-syndicate", "202": "sample-backlist" } : view.links;
  const books = isSample ? [{ id: "sample-syndicate", title: "Syndicate · sample book" }, { id: "sample-backlist", title: "Backlist · sample book" }] : view.books;
  const campaignIds = [...new Set(snapshot.rows.map(r => r.campaignId))];
  const knownBooks = new Set(books.map(b => b.id));
  const linkedBook = (id: string) => knownBooks.has(links[id]) ? links[id] : null;
  const mappedBooks = books.filter(b => campaignIds.some(id => linkedBook(id) === b.id));
  const activeBook = book === "unmapped" || mappedBooks.some(b => b.id === book) ? book : "all";
  const scoped = { ...snapshot, rows: snapshot.rows.filter(r => activeBook === "all" || (activeBook === "unmapped" ? !linkedBook(r.campaignId) : linkedBook(r.campaignId) === activeBook)) };
  const a = analyzeAds(scoped);
  const currentRows = scoped.rows.filter(r => r.date >= a.split), priorRows = scoped.rows.filter(r => r.date < a.split);
  const sourceDays = new Set(scoped.rows.map(r => r.date)).size;
  const trackedRows = currentRows.filter(r => r.purchases !== null).length;
  const attention = a.campaigns.filter(c => c.status === "Review click costs");
  const lower = a.campaigns.filter(c => c.status === "Lower click costs");
  const sparse = a.campaigns.filter(c => c.status === "More data needed");
  const scopeName = activeBook === "all" ? "All your campaigns" : activeBook === "unmapped" ? "Unmapped campaigns" : books.find(b => b.id === activeBook)?.title;
  const narrativeTitle = !currentRows.length ? "The next chapter needs more evidence." : attention.length ? `Click costs rose in ${attention.length === 1 ? "one campaign" : `${attention.length} campaigns`}. Start there.` : lower.length ? "A lower click cost is worth a closer look." : sparse.length === a.campaigns.length ? "Let the evidence catch up with the idea." : "Your click costs are broadly steady.";
  const narrative = !currentRows.length ? "There are no source rows for the latest seven days in this selection. Check the date range before drawing a conclusion about activity." : attention.length ? `${attention[0].name} moved from ${money(attention[0].prior.cpc, snapshot.account.currency)} to ${money(attention[0].recent.cpc, snapshot.account.currency)} per link click. Inspect the ads and delivery behind the change before adjusting your approach.` : lower.length ? `${lower[0].name} moved from ${money(lower[0].prior.cpc, snapshot.account.currency)} to ${money(lower[0].recent.cpc, snapshot.account.currency)} per link click. Check it against your actual sales or lead goal before scaling.` : sparse.length === a.campaigns.length ? "At least one window in each campaign has fewer than 50 link clicks or 1,000 impressions. Check the source and tracking before calling a winner." : "No campaign with enough activity crossed the 20% click-cost review threshold. Use the comparison below to decide what is worth investigating.";
  const bookViews = [{ id: "all", title: "All books", campaignCount: campaignIds.length }, ...mappedBooks.map(b => ({ ...b, campaignCount: campaignIds.filter(id => linkedBook(id) === b.id).length })), ...(campaignIds.some(id => !linkedBook(id)) ? [{ id: "unmapped", title: "Not mapped yet", campaignCount: campaignIds.filter(id => !linkedBook(id)).length }] : [])];
  return <>
    <section className="ads-book-shelf" aria-label="View analytics by book"><div className="ads-section-head"><div><span className="eyebrow">YOUR BOOKS, IN FOCUS</span><h2>Every story has its own journey.</h2></div><p className="quiet-note">Choose a book to focus this report.</p></div><div className="ads-book-filters">{bookViews.map((b, index) => {
      const rows = snapshot.rows.filter(r => r.date >= a.split && (b.id === "all" || (b.id === "unmapped" ? !linkedBook(r.campaignId) : linkedBook(r.campaignId) === b.id)));
      const total = totals(rows);
      return <button key={b.id} aria-pressed={activeBook === b.id} onClick={() => setBook(b.id)}><span className={`ads-book-mark ads-book-mark-${index % 3}`} aria-hidden="true">{b.id === "all" ? <BookOpen size={23}/> : b.id === "unmapped" ? "?" : b.title.slice(0, 1)}<i/></span><span className="ads-book-tile-copy"><strong>{b.title}</strong><small>{b.campaignCount} {b.campaignCount === 1 ? "campaign" : "campaigns"}</small><span className="ads-book-tile-metric">{rows.length ? money(total.spend, snapshot.account.currency) : "No rows"}<small>{rows.length ? `${total.clicks.toLocaleString()} link clicks` : "in latest week"}</small></span></span>{activeBook === b.id && <Check className="ads-book-selected" size={14}/>}</button>;
    })}</div><p className="quiet-note ads-shelf-note">Latest seven days · reported spend and link clicks. Title tiles identify books; map campaigns below to organize this view.</p></section>

    <section className="ads-weekly-section" aria-labelledby="ads-weekly-heading"><div className="ads-section-head"><div><span className="eyebrow">YOUR SEVEN-DAY PERSPECTIVE</span><h2 id="ads-weekly-heading">A little clarity before your next move.</h2></div><span className="ads-scope-label" role="status">{scopeName}</span></div>
      <Card className="ads-weekly-brief"><div className="ads-brief-story"><span className="ads-brief-date">{isSample ? "DEMO REPORT" : "YOUR WEEKLY READ"}<span/>{dateLabel(a.split)}–{dateLabel(snapshot.until)}</span><h3>{narrativeTitle}</h3><p>{narrative}</p><div className="ads-brief-signals"><span><i className="attention"/>{attention.length} to review</span><span><i className="lower"/>{lower.length} with lower costs</span><span><i/>{sparse.length} needing more evidence</span></div></div><div className="ads-brief-context"><div><Info size={17}/><span className="eyebrow">READ WITH CONTEXT</span></div><strong>{a.current.purchases === null ? "Clicks tell part of the story." : trackedRows < currentRows.length ? "Purchase coverage is incomplete." : "Attribution needs context."}</strong><p>{a.current.purchases === null ? "Sales are not tracked in these rows. Unknown is different from zero; check your retailer or store reporting." : `${a.current.purchases.toLocaleString()} purchases reported${trackedRows < currentRows.length ? ` across ${trackedRows} of ${currentRows.length} rows` : ""}. Attribution does not prove that the ads caused additional book sales.`}</p><span className="ads-coverage-note">{sourceDays} of 14 days have source rows{sourceDays < 14 ? " · check report coverage" : ""}</span></div></Card>
    </section>

    <div className="ads-metrics">{[
      { label: "Spend", value: currentRows.length ? money(a.current.spend, snapshot.account.currency) : "No rows", delta: change(currentRows.length ? a.current.spend : null, priorRows.length ? a.previous.spend : null), detail: "Reported ad spend · not a budget limit", icon: <span aria-hidden="true">{snapshot.account.currency}</span> },
      { label: "Link clicks", value: currentRows.length ? a.current.clicks.toLocaleString() : "No rows", delta: change(currentRows.length ? a.current.clicks : null, priorRows.length ? a.previous.clicks : null), detail: "Clicks on links · not confirmed readers", icon: <MousePointer2 size={16}/> },
      { label: "Cost per link click", value: currentRows.length ? money(a.current.cpc, snapshot.account.currency) : "No rows", delta: change(currentRows.length ? a.current.cpc : null, priorRows.length ? a.previous.cpc : null), detail: "Reported spend divided by link clicks", icon: <Target size={16}/> },
      { label: "Reported purchases", value: a.current.purchases === null ? "Not tracked" : a.current.purchases.toLocaleString(), delta: a.current.purchases === null ? "Sales data unavailable" : trackedRows < currentRows.length ? "Partial purchase coverage" : "Meta-attributed purchases", detail: a.current.purchases === null ? "Unknown is different from zero" : "Not proof of additional book sales", icon: <BookOpen size={16}/> },
    ].map(m => <Card className="ads-metric" key={m.label}><div className="ads-metric-label"><span>{m.label}</span>{m.icon}</div><strong className={/[a-z]/i.test(m.value) ? "ads-text-value" : ""}>{m.value}</strong><small className="ads-metric-delta">{m.delta.startsWith("+") ? <ArrowUpRight size={14}/> : m.delta.startsWith("-") ? <ArrowDownRight size={14}/> : null}{m.delta}</small><small>{m.detail}</small></Card>)}</div>

    <div className="ads-overview-grid"><Trend snapshot={scoped} analysis={a}/><NextExperiment snapshot={scoped} analysis={a} view={view} preview={preview} busy={busy} saveIdea={saveIdea} inspect={inspect}/></div>

    <section className="ads-campaign-section" aria-labelledby="ads-campaign-heading"><div className="ads-section-head"><div><span className="eyebrow">WHERE THE NUMBERS COME FROM</span><h2 id="ads-campaign-heading">Your campaigns</h2></div><p className="quiet-note">Latest seven days vs previous seven<br/>Ordered by reported spend.</p></div>
      {!a.campaigns.length && <Card className="ads-panel ads-inline-empty"><BookOpen size={28}/><p>No campaign rows in this selection. Choose another book or check your source report.</p></Card>}
      <div className="ads-campaign-grid">{a.campaigns.map((c, index) => {
        const hasCurrent = currentRows.some(row => row.campaignId === c.id), hasPrior = priorRows.some(row => row.campaignId === c.id);
        const maxSpend = Math.max(c.recent.spend, c.prior.spend, 1);
        return <Card className="ads-panel ads-campaign-card" key={c.id}><div className="ads-campaign-top"><span className="ads-campaign-index">{String(index + 1).padStart(2, "0")}</span><span className={`ads-status ${statusClass(c.status)}`}>{c.status}</span></div><h3>{c.name}</h3><p className="quiet-note ads-campaign-objective">{linkedBook(c.id) ? books.find(b => b.id === linkedBook(c.id))?.title : "Book not mapped"}<span>·</span>{c.objective.replaceAll("_", " ").toLowerCase()}</p><div className="ads-comparison"><div><small>Previous 7 days</small><span>{hasPrior ? money(c.prior.cpc, snapshot.account.currency) : "No rows"}</span></div><ArrowRight aria-hidden="true" size={19}/><div><small>Latest 7 days</small><strong>{hasCurrent ? money(c.recent.cpc, snapshot.account.currency) : "No rows"}</strong></div><span className="ads-comparison-caption">per link click{c.change !== null && <b>{c.change > 0 ? "+" : ""}{c.change.toFixed(1)}%</b>}</span></div><div className="ads-spend-comparison"><span>Reported spend</span><div><small>Previous</small><i><b className="previous" style={{ width: `${c.prior.spend / maxSpend * 100}%` }}/></i><strong>{hasPrior ? money(c.prior.spend, snapshot.account.currency) : "No rows"}</strong></div><div><small>Latest</small><i><b style={{ width: `${c.recent.spend / maxSpend * 100}%` }}/></i><strong>{hasCurrent ? money(c.recent.spend, snapshot.account.currency) : "No rows"}</strong></div></div><div className="ads-campaign-evidence"><span>{hasCurrent ? c.recent.clicks.toLocaleString() : "—"}<small>latest link clicks</small></span><span>{hasCurrent ? c.recent.impressions.toLocaleString() : "—"}<small>latest impressions</small></span></div><p className="ads-campaign-explanation">{c.explanation}</p><label className="ads-label">Which book is this campaign for?<select value={linkedBook(c.id) ?? ""} disabled={isSample || busy || !view.canEdit || !view.available} onChange={e => mapBook(c.id, e.target.value || null)}><option value="">Not mapped yet</option>{books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label><Button variant="outline" onClick={() => inspect(c.name)}>See ads & creative results <ChevronRight size={15}/></Button></Card>;
      })}</div>
    </section>
    <p className="quiet-note ads-provenance"><Info size={15}/> <span>Source: {isSample ? "fictional demo" : snapshot.data_origin === "manual_snapshot" ? "manual Ads Manager export" : "saved Meta report"} · {dateLabel(snapshot.since)}–{dateLabel(snapshot.until)}. Attribution: {snapshot.attribution === "not_verified" ? "not verified in this export" : "7-day click / 1-day view, reported on impression date"}. Figures total reported rows. Comparisons describe this snapshot; a click-cost change is not proof of sales performance.</span></p>
  </>;
}

export function CreativeComparison({ snapshot, adId }: { snapshot: AdsSnapshot; adId: string }) {
  const split = new Date(Date.parse(snapshot.until + "T12:00:00Z") - 6 * 86400000).toISOString().slice(0, 10);
  const rows = snapshot.rows.filter(r => r.adId === adId);
  const currentRows = rows.filter(r => r.date >= split), priorRows = rows.filter(r => r.date < split);
  const current = totals(currentRows), previous = totals(priorRows);
  const enough = current.clicks >= 50 && previous.clicks >= 50 && current.impressions >= 1000 && previous.impressions >= 1000;
  return <div className="ads-creative-comparison"><span className="eyebrow">LATEST 7 DAYS / PREVIOUS 7 DAYS</span><dl><div><dt>Spend</dt><dd>{currentRows.length ? money(current.spend, snapshot.account.currency) : "No rows"} <small>was {priorRows.length ? money(previous.spend, snapshot.account.currency) : "no rows reported"}</small></dd></div><div><dt>Link clicks</dt><dd>{currentRows.length ? current.clicks.toLocaleString() : "No rows"} <small>was {priorRows.length ? previous.clicks.toLocaleString() : "no rows reported"}</small></dd></div><div><dt>Cost / link click</dt><dd>{currentRows.length ? money(current.cpc, snapshot.account.currency) : "No rows"} <small>was {priorRows.length ? money(previous.cpc, snapshot.account.currency) : "no rows reported"}</small></dd></div></dl><p className="quiet-note">{enough ? "Enough activity for a directional comparison. Different audiences and placements can explain differences; this is not a controlled test." : "More evidence needed: fewer than 50 clicks or 1,000 impressions in at least one period. No winner declared."}</p></div>;
}
