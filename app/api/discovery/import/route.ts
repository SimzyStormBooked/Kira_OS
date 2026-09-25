import { assertSameOrigin } from "@/lib/auth/security";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { boundedBody,DiscoveryError,discoveryFailure,discoveryHeaders } from "@/lib/discovery/http";
import { discoveryControl,loadDiscoveryView } from "@/lib/discovery/repository";
import { importSearchCsv } from "@/lib/discovery/csv";
export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const s=await requireWorkspaceSession();
    if(await getWorkspaceRole(s)==='viewer')throw new DiscoveryError('An owner or editor can import reports.',403);
    const body=await boundedBody(request,2100000);
    let form:FormData;
    try{form=await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type')??''}}).formData();}
    catch{throw new DiscoveryError('Choose the CSV file again and include its property and report dates.');}
    const fields=['file','since','until','property'];
    if([...form.keys()].some(field=>!fields.includes(field))||fields.some(field=>form.getAll(field).length!==1))throw new DiscoveryError('Include one CSV file, its property, and its report dates.');
    const file=form.get('file'),since=form.get('since'),until=form.get('until'),property=form.get('property');
    if(!(file instanceof File)||file.size>2000000||!file.name.toLowerCase().endsWith('.csv'))throw new DiscoveryError('Choose a Search Console CSV under 2 MB.');
    if(typeof since!=='string'||typeof until!=='string'||typeof property!=='string')throw new DiscoveryError('Enter the property and report dates shown on the export.');
    let snapshot;
    try{snapshot=importSearchCsv(await file.text(),since,until,property);}
    catch(error){throw new DiscoveryError(error instanceof Error?error.message:'Check the exported file.');}
    await discoveryControl(s.supabase,s.authorId,'search',{snapshot});
    return Response.json(await loadDiscoveryView(),{headers:discoveryHeaders});
  }catch(error){return discoveryFailure(error);}
}
