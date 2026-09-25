"use client";
import {useState} from "react";
import type {SearchSnapshot} from "@/lib/discovery/contract";
import {Button} from "@/components/ui/button";

export function SearchTrend({snapshot}:{snapshot:SearchSnapshot}) {
  const [metric,setMetric]=useState<'clicks'|'impressions'>('clicks');
  if(snapshot.dimension!=='date'||!snapshot.rows.length)return null;
  const rows=[...snapshot.rows].sort((a,b)=>a.key.localeCompare(b.key)).slice(-90);
  const max=Math.max(1,...rows.map(row=>row[metric]));
  return <section className="discovery-trend" aria-label="Daily search trend">
    <div className="discovery-row"><div><span className="eyebrow">YOUR REPORTED DAYS</span><h3>A little perspective, day by day.</h3></div><div className="discovery-actions" role="group" aria-label="Search chart metric"><Button variant={metric==='clicks'?'default':'outline'} aria-pressed={metric==='clicks'} onClick={()=>setMetric('clicks')}>Clicks</Button><Button variant={metric==='impressions'?'default':'outline'} aria-pressed={metric==='impressions'} onClick={()=>setMetric('impressions')}>Impressions</Button></div></div>
    <p className="quiet-note">Up to 90 reported days. Gaps are unknown. Hover or focus a day for its exact result; the table below holds the same source data.</p>
    <div className="discovery-bars" role="list" aria-label={`Reported daily ${metric}`}>
      {rows.map(row=><div role="listitem" key={row.key} className="discovery-bar-day" tabIndex={0} aria-label={`${row.key}: ${row[metric].toLocaleString()} ${metric}`}><div className="discovery-bar" style={{height:`${Math.max(row[metric]===0?0:1,row[metric]/max*100)}%`}}/><span className="discovery-bar-value">{row.key}<br/>{row[metric].toLocaleString()} {metric}</span></div>)}
    </div><div className="discovery-chart-axis"><span>{rows[0].key}</span><span>{rows.at(-1)!.key}</span></div>
  </section>;
}
