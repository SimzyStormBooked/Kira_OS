import { z } from "zod";
import { manuscriptFactSchema } from "@/lib/manuscripts/contract";
export const catalogBookSchema = z.object({id:z.uuid(),slug:z.string(),title:z.string(),metadata:z.record(z.string(),z.unknown()),series_id:z.uuid().nullable(),manuscript_id:z.uuid(),facts:manuscriptFactSchema.array()});
export type CatalogBook=z.infer<typeof catalogBookSchema>;
const ignored=new Set("the a an and or of in to with is are this that book story passage describes contains features characters character theme readers reader trope has their they both explores strong narrative central through between about as on by it its from for".split(" "));
function words(value:string){return new Set(value.toLowerCase().replace(/[^\p{L}\p{N} ]/gu," ").split(/\s+/).filter(w=>w.length>2&&!ignored.has(w)));}
/** Deterministic textual overlap is a campaign hypothesis, never a performance signal. */
export function catalogOpportunities(books:CatalogBook[]) {
 const matches:{id:string;left:CatalogBook;right:CatalogBook;signals:{left:CatalogBook["facts"][number];right:CatalogBook["facts"][number];shared:string[]}[]}[]=[];
 for(let i=0;i<books.length;i++)for(let j=i+1;j<books.length;j++){
  const left=books[i],right=books[j],signals:typeof matches[number]["signals"]=[];
  for(const l of left.facts)for(const r of right.facts){if(l.kind!=="supported"||r.kind!=="supported"||l.spoiler||r.spoiler||l.category!==r.category||signals.length>=3)continue;const a=words(l.statement),b=words(r.statement),shared=[...a].filter(w=>b.has(w));if(shared.length>=2&&shared.length/new Set([...a,...b]).size>=0.4)signals.push({left:l,right:r,shared});}
  if(signals.length)matches.push({id:`${left.id}:${right.id}`,left,right,signals});
 }
 return matches.sort((a,b)=>b.signals.length-a.signals.length).slice(0,30);
}
