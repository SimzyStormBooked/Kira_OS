import { NextResponse } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { newOAuthState, stateHash } from "@/lib/connections/meta-crypto";
import { metaAuthorizationUrl } from "@/lib/connections/meta-provider";
import { adsConfig } from "@/lib/ads/meta";
import { adsControl } from "@/lib/ads/repository";
import { adsFailure, adsHeaders } from "@/lib/ads/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const session = await requireWorkspaceSession(); const config = adsConfig(); if (!config) throw new Error("Setup pending");
    const state = newOAuthState(); await adsControl(session.supabase, session.authorId, "begin", { hash: stateHash(state) });
    const response = NextResponse.redirect(metaAuthorizationUrl(config, state), { status: 303, headers: adsHeaders });
    response.cookies.set("kira_ads_oauth", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/ads/meta/callback", maxAge: 600 });
    return response;
  } catch (error) { return adsFailure(error); }
}
