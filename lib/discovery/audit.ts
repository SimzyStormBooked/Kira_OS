import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { parse } from "parse5";
import robotsParser from "robots-parser";
import { auditSchema, publicUrlSchema, type Audit } from "./contract";

export class AuditError extends Error {constructor(public code:"page_unavailable"|"robots_blocked"){super(code);}}
export function publicAddress(address:string){try {const parsed=ipaddr.parse(address);return parsed.range()==="unicast";}catch{return false;}}
export function auditUrl(value:string){
  const u=new URL(publicUrlSchema.parse(value));
  if(ipaddr.isValid(u.hostname.replace(/^\[|\]$/g,""))||/(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(u.hostname)||/\/(?:api|admin|login|signin|account|checkout|cart|auth)(?:\/|$)/i.test(u.pathname))throw new AuditError("page_unavailable");
  return u;
}
async function publicGet(url:URL,limit:number){
  let dnsDeadline:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([
    lookup(url.hostname,{all:true,verbatim:true}),
    new Promise<never>((_,reject)=>{dnsDeadline=setTimeout(()=>reject(new AuditError("page_unavailable")),5000);}),
  ]).catch(()=>{throw new AuditError("page_unavailable");}).finally(()=>clearTimeout(dnsDeadline));
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new AuditError("page_unavailable");
  const address=addresses[0];
  return new Promise<{status:number;location:string|null;type:string;body:string}>((resolve,reject)=>{
    const fail=()=>{clearTimeout(deadline);reject(new AuditError("page_unavailable"));};
    // Pin the vetted address; redirects re-enter DNS validation. TLS still checks the URL hostname.
    const req=request(url,{method:"GET",agent:false,family:address.family,lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family),headers:{"User-Agent":"KiraDiscovery/1.0 (single-page author-requested audit)",Accept:"text/html,text/plain","Accept-Encoding":"identity"}},res=>{
      const encoding=res.headers['content-encoding'];if(encoding&&encoding!=='identity'){res.destroy();req.destroy();fail();return;}
      let size=0;const chunks:Buffer[]=[];res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>limit){res.destroy();req.destroy();fail();}else chunks.push(chunk);});
      res.on("error",fail);res.on("end",()=>{clearTimeout(deadline);resolve({status:res.statusCode??0,location:res.headers.location??null,type:String(res.headers["content-type"]??""),body:Buffer.concat(chunks).toString("utf8")});});
    });
    const deadline=setTimeout(()=>{req.destroy();fail();},12000);req.once("error",fail);req.end();
  });
}
export function parseAuditHtml(html:string,url:string):Audit{
  const document=parse(html);const h1:string[]=[];let title:string|null=null,description:string|null=null,canonical:string|null=null;let fileAlts=0,noindex=false;
  type Node={nodeName:string;tagName?:string;value?:string;childNodes?:Node[];attrs?:{name:string;value:string}[]};
  const appendChildren=(stack:Node[],n:Node)=>{const children=n.childNodes??[];for(let i=children.length-1;i>=0;i--)stack.push(children[i]);};
  const text=(root:Node):string=>{const stack=[root],parts:string[]=[];while(stack.length){const n=stack.pop()!;if(n.nodeName==="#text")parts.push(n.value??"");else appendChildren(stack,n);}return parts.join(" ").replace(/\s+/g," ").trim();};
  const stack:Node[]=[document as Node];while(stack.length){const n=stack.pop()!;const attrs=Object.fromEntries((n.attrs??[]).map(a=>[a.name,a.value]));
    if(n.tagName==="title"&&title===null)title=text(n).slice(0,1000)||null;
    if(n.tagName==="meta"&&attrs.name?.toLowerCase()==="description"&&description===null)description=attrs.content?.trim().slice(0,3000)||null;
    if(n.tagName==="meta"&&["robots","googlebot"].includes(attrs.name?.toLowerCase())&&/noindex/i.test(attrs.content??""))noindex=true;
    if(n.tagName==="link"&&attrs.rel?.toLowerCase().split(/\s+/).includes("canonical")){try{const u=new URL(attrs.href,url);if(u.protocol==="https:"&&!u.username&&!u.password)canonical=u.toString().slice(0,2000);}catch{}}
    if(n.tagName==="h1"&&h1.length<50)h1.push(text(n).slice(0,1000));
    if(n.tagName==="img"&&/\.(jpg|jpeg|png|webp|gif)$/i.test(attrs.alt??""))fileAlts++;
    appendChildren(stack,n);
  }
  const findings:Audit["findings"]=[];
  if(!title||/^(blank page|untitled|home)(\s*[|\-]|$)/i.test(title))findings.push({code:"page_title",title:"Give this page a descriptive title",detail:"The returned page title is missing or starts with a generic placeholder.",suggestion:"Use the author, book, or series name and the page’s actual purpose. Review the change in your website editor."});
  if(!description)findings.push({code:"description",title:"Add a useful search description",detail:"No non-empty HTML meta description was found in the returned page.",suggestion:"Prepare a short, accurate introduction using approved public book information. Google may choose a different snippet."});
  if(h1.length!==1||/sign up|newsletter|subscribe/i.test(h1[0]??""))findings.push({code:"headings",title:"Make the main heading describe the page",detail:`Found ${h1.length} main headings in the returned HTML. Check that the author, book, or collection is clearly introduced.`,suggestion:"Use a clear primary heading and supporting subheadings. Heading count alone is not evidence of a Google penalty."});
  if(!canonical)findings.push({code:"canonical",title:"Check the preferred page address",detail:"No canonical link was found in the returned HTML.",suggestion:"Review the page’s canonical setting in your website editor before changing it."});
  if(fileAlts)findings.push({code:"cover_alternatives",title:"Give meaningful cover images readable descriptions",detail:`${fileAlts} image alternatives look like filenames.`,suggestion:"Describe meaningful book covers briefly. Keep genuinely decorative images empty."});
  if(noindex)findings.push({code:"noindex",title:"Confirm whether this page should appear in search",detail:"The returned HTML includes a noindex instruction.",suggestion:"Keep private pages excluded. If this is an intended public book page, review its indexing setting with the site owner."});
  return auditSchema.parse({url,checkedAt:new Date().toISOString(),title,description,canonical,h1,findings,statusCode:200});
}
export async function auditPage(value:string):Promise<Audit>{
  let url=auditUrl(value);const robots=new Map<string,string>();
  for(let hop=0;hop<4;hop++){
    if(!robots.has(url.origin)){
      const rules=await publicGet(new URL("/robots.txt",url.origin),200000);
      if(rules.status!==404&&(rules.status<200||rules.status>=300))throw new AuditError("robots_blocked");
      robots.set(url.origin,rules.status===404?"":rules.body);
    }
    const policy=robotsParser(new URL("/robots.txt",url.origin).toString(),robots.get(url.origin)!);
    if(policy.isAllowed(url.toString(),"KiraDiscovery")===false)throw new AuditError("robots_blocked");
    const result=await publicGet(url,2000000);
    if(result.status>=300&&result.status<400&&result.location){url=auditUrl(new URL(result.location,url).toString());continue;}
    if(result.status!==200||!result.type.toLowerCase().includes("text/html"))throw new AuditError("page_unavailable");
    return parseAuditHtml(result.body,url.toString());
  }
  throw new AuditError("page_unavailable");
}
