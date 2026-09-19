import { randomUUID } from "node:crypto";
import { describe,it,expect } from "vitest";
import { catalogOpportunities,type CatalogBook } from "@/lib/catalog/opportunities";
function book(statement:string):CatalogBook{return {id:randomUUID(),slug:"book",title:"Synthetic book",metadata:{},series_id:null,manuscript_id:randomUUID(),facts:[{category:"theme",kind:"supported",spoiler:false,statement,citations:[{chunk_id:randomUUID(),quote:"Found family protects the archive."}]}]};}
describe("catalog hypotheses",()=>{
 it("requires specific supported overlap and preserves evidence on both sides",()=>{const left=book("Found family protects the archive"),right=book("Found family protects the archive together");const match=catalogOpportunities([left,right]);expect(match).toHaveLength(1);expect(match[0].signals[0].left.citations).toEqual(left.facts[0].citations);expect(match[0].signals[0].right.citations).toEqual(right.facts[0].citations);});
 it("excludes generic overlap, spoilers, inference and single-book claims",()=>{expect(catalogOpportunities([book("The story contains characters"),book("The story features characters")])).toEqual([]);const a=book("Found family protects the archive"),b=book("Found family protects the archive");b.facts[0].spoiler=true;expect(catalogOpportunities([a,b])).toEqual([]);b.facts[0].spoiler=false;b.facts[0].kind="inference";expect(catalogOpportunities([a,b])).toEqual([]);expect(catalogOpportunities([a])).toEqual([]);});
});
