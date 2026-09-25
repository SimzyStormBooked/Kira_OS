import { z } from "zod";
import { start } from "workflow/api";
import { assertSameOrigin } from "@/lib/auth/security";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { boundedBody,DiscoveryError,discoveryFailure,discoveryHeaders } from "@/lib/discovery/http";
import { discoveryControl,discoveryWorker,loadDiscoveryView } from "@/lib/discovery/repository";
import { googleConfig,decryptGoogle,revokeGoogle } from "@/lib/discovery/google";
import { refreshDiscoveryInBackground } from "@/workflows/discovery";
const input=z.discriminatedUnion('action',[z.object({action:z.literal('select'),property:z.string().min(1).max(2000)}).strict(),z.object({action:z.literal('disconnect')}).strict(),z.object({action:z.literal('sync')}).strict()]);
export async function POST(request:Request){try{assertSameOrigin(request);const s=await requireWorkspaceSession();const body=input.parse(JSON.parse(await boundedBody(request,5000)));let revocationFailed=false;if(body.action==='sync'){if(!googleConfig())throw new DiscoveryError('Google connection setup is pending. You can import a Search Console export now.',409);const job=await discoveryControl(s.supabase,s.authorId,'sync');if(job.state==='queued'){try{await start(refreshDiscoveryInBackground,[z.uuid().parse(job.id)]);}catch(error){await discoveryWorker('fail',job.id,null,{code:'interrupted'}).catch(()=>{});throw error;}}}else{const result=await discoveryControl(s.supabase,s.authorId,body.action,body,true);if(body.action==='disconnect'&&result){const c=googleConfig();try{revocationFailed=!c||!await revokeGoogle(decryptGoogle(result.ciphertext,c.key,s.authorId,result.actorId));}catch{revocationFailed=true;}}}return Response.json({...await loadDiscoveryView(),...(revocationFailed?{notice:'Disconnected locally. Remove KIRA access in your Google Account connections to finish revocation.'}:{})},{headers:discoveryHeaders});}catch(error){return discoveryFailure(error);}}
