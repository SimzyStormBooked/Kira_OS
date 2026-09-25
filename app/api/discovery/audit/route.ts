import { z } from "zod";
import { start } from "workflow/api";
import { assertSameOrigin } from "@/lib/auth/security";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { boundedBody,discoveryFailure,discoveryHeaders } from "@/lib/discovery/http";
import { discoveryControl,discoveryWorker,loadDiscoveryView } from "@/lib/discovery/repository";
import { refreshDiscoveryInBackground } from "@/workflows/discovery";
export const maxDuration=30;
export async function POST(request:Request){try{assertSameOrigin(request);const s=await requireWorkspaceSession();const body=z.object({pageId:z.uuid()}).strict().parse(JSON.parse(await boundedBody(request,4000)));const job=await discoveryControl(s.supabase,s.authorId,'audit',body);if(job.state==='queued'){try{await start(refreshDiscoveryInBackground,[z.uuid().parse(job.id)]);}catch(error){await discoveryWorker('fail',job.id,null,{code:'interrupted'}).catch(()=>{});throw error;}}return Response.json(await loadDiscoveryView(),{headers:discoveryHeaders});}catch(error){return discoveryFailure(error);}}
