import { assertSameOrigin } from "@/lib/auth/security";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { discoveryInputSchema } from "@/lib/discovery/contract";
import { boundedBody,discoveryFailure,discoveryHeaders } from "@/lib/discovery/http";
import { discoveryControl,loadDiscoveryView } from "@/lib/discovery/repository";
export async function GET(){try{return Response.json(await loadDiscoveryView(),{headers:discoveryHeaders});}catch(error){return discoveryFailure(error);}}
export async function POST(request:Request){try{assertSameOrigin(request);const s=await requireWorkspaceSession();const body=discoveryInputSchema.parse(JSON.parse(await boundedBody(request)));await discoveryControl(s.supabase,s.authorId,body.action,body);return Response.json(await loadDiscoveryView(),{headers:discoveryHeaders});}catch(error){return discoveryFailure(error);}}
