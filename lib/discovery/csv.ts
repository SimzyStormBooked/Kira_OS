import { z } from "zod";
import { searchSnapshotSchema, type SearchSnapshot } from "./contract";
export function csvRows(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],cell="",quoted=false,closed=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
    if(ch==='"'){if(cell||closed)throw new Error("Invalid CSV quotation.");quoted=true;}
    else if(ch===','||ch==='\n'){row.push(cell);cell="";closed=false;if(ch==='\n'){if(row.some(c=>c!==""))rows.push(row);row=[];}}
    else if(ch==='\r'&&text[i+1]==='\n')continue;
    else{if(closed)throw new Error("Invalid text after CSV quotation.");cell+=ch;}
    if(rows.length>10001)throw new Error("Use an export with at most 10,000 rows.");
  }
  if(quoted)throw new Error("The CSV ends inside a quoted value.");row.push(cell);if(row.some(c=>c!==""))rows.push(row);return rows;
}
export function importSearchCsv(text:string,since:string,until:string,property:string):SearchSnapshot{
  z.iso.date().parse(since);z.iso.date().parse(until);
  if(since>until||until>new Date().toISOString().slice(0,10)||Date.parse(until)-Date.parse(since)>366*86400000)throw new Error("Use the export’s actual date range, at most one year, ending no later than today.");
  if(!property.trim()||property.length>2000)throw new Error("Enter the Search Console property shown on your export.");
  const raw=csvRows(text.replace(/^\uFEFF/,""));if(raw.length<2)throw new Error("The export has no rows.");
  const headers=raw.shift()!.map(h=>h.trim().toLowerCase());if(new Set(headers).size!==headers.length)throw new Error("The CSV contains duplicate column headings.");
  const choices=[['date','date'],['top pages','page'],['page','page'],['top queries','query'],['query','query']] as const;
  const dimensions=choices.filter(([heading])=>headers.includes(heading));if(dimensions.length!==1)throw new Error("Export one Search Console tab: Dates, Pages, or Queries. Combined tables are not supported.");
  const [heading,dimension]=dimensions[0];const ix={key:headers.indexOf(heading),clicks:headers.indexOf('clicks'),impressions:headers.indexOf('impressions'),position:headers.indexOf('position')};
  if(Object.values(ix).some(i=>i<0)||!headers.includes('ctr'))throw new Error("Include Clicks, Impressions, CTR, and Position in an English Search Console CSV.");
  const num=(v:string)=>{if(!/^\d+(?:\.\d+)?$/.test(v.trim())||!Number.isFinite(Number(v)))throw new Error("Use unformatted English numeric values without currency signs or thousands separators.");return Number(v);};
  const rows=raw.map(row=>{if(row.length!==headers.length)throw new Error("A CSV row has the wrong number of columns.");const key=row[ix.key].trim(),clicks=num(row[ix.clicks]),impressions=num(row[ix.impressions]),position=num(row[ix.position]);if(!key||!Number.isSafeInteger(clicks)||!Number.isSafeInteger(impressions)||clicks>impressions)throw new Error("Check the exported labels, clicks and impressions.");if(dimension==='date'&&(!z.iso.date().safeParse(key).success||key<since||key>until))throw new Error("Date rows must use YYYY-MM-DD and fall within the report dates.");return {key,clicks,impressions,ctr:impressions?clicks/impressions:0,position};});
  if(new Set(rows.map(r=>r.key)).size!==rows.length)throw new Error("Duplicate rows found. Export one tab without combining reports.");
  const clicks=rows.reduce((n,r)=>n+r.clicks,0),impressions=rows.reduce((n,r)=>n+r.impressions,0);
  if(!Number.isSafeInteger(clicks)||!Number.isSafeInteger(impressions))throw new Error("The exported counts are too large to total accurately.");
  return searchSnapshotSchema.parse({data_origin:'manual_snapshot',property:property.trim(),dimension,since,until,fetchedAt:new Date().toISOString(),rows,totals:dimension==='date'?{clicks,impressions,ctr:impressions?clicks/impressions:0,position:impressions?rows.reduce((n,r)=>n+r.position*r.impressions,0)/impressions:0}:null,warning:"Manual Search Console export; not live synced. Filters and completeness are as supplied. Missing rows are unknown. Page/query rows are not site totals; clicks are not purchases."});
}
