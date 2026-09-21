import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { encryptMetaCredential, equalOAuthState, stateHash } from "@/lib/connections/meta-crypto";
import { adsConfig, exchangeAdsCode } from "@/lib/ads/meta";
import { adsControl } from "@/lib/ads/repository";
import { adsHeaders } from "@/lib/ads/http";
export async function GET(request: NextRequest) {
  const config = adsConfig(); if (!config) return NextResponse.json({ error: "Facebook Ads setup is pending." }, { status: 503, headers: adsHeaders });
  let outcome = "failed";
  try {
    const session = await requireWorkspaceSession(); const state = request.nextUrl.searchParams.get("state");
    if (!equalOAuthState(request.cookies.get("kira_ads_oauth")?.value, state)) throw new Error("Invalid state");
    const hash = stateHash(state!); await adsControl(session.supabase, session.authorId, "consume", { hash });
    if (request.nextUrl.searchParams.has("error")) outcome = "cancelled";
    else {
      const code = request.nextUrl.searchParams.get("code"); if (!code || code.length > 4096) throw new Error("Invalid code");
      const verified = await exchangeAdsCode(config, code);
      const ciphertext = encryptMetaCredential({ token: verified.token }, config.credentialKey, session.authorId, verified.metaUserId);
      await adsControl(session.supabase, session.authorId, "connect", { hash, ciphertext, metaUserId: verified.metaUserId, accounts: verified.accounts, expiresAt: verified.expiresAt }); outcome = "connected";
    }
  } catch { /* Never return provider bodies or tokens. */ }
  const response = NextResponse.redirect(`${config.origin}/ads?connection=${outcome}`, { status: 303, headers: adsHeaders });
  response.cookies.set("kira_ads_oauth", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/ads/meta/callback", maxAge: 0 }); return response;
}
