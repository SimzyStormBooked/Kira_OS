import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/security";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { newOAuthState,stateHash } from "@/lib/connections/meta-crypto";
import { googleConfig,authorizationUrl } from "@/lib/discovery/google";
import { discoveryControl } from "@/lib/discovery/repository";
import { DiscoveryError,discoveryFailure,discoveryHeaders } from "@/lib/discovery/http";
export async function POST(request:Request){try{assertSameOrigin(request);const s=await requireWorkspaceSession(),config=googleConfig();if(!config)throw new DiscoveryError('Google connection setup is pending. You can import a Search Console export now.',409);const state=newOAuthState(),verifier=newOAuthState();await discoveryControl(s.supabase,s.authorId,'begin',{hash:stateHash(state)},true);const response=NextResponse.redirect(authorizationUrl(config,state,verifier),{status:303,headers:discoveryHeaders});response.cookies.set('kira_discovery_oauth',`${state}.${verifier}`,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/discovery/google/callback',maxAge:600});return response;}catch(error){return discoveryFailure(error);}}
