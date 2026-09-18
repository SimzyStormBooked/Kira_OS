import { NextResponse } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { getMetaConfig } from "@/lib/connections/meta-config";
import { newOAuthState, stateHash } from "@/lib/connections/meta-crypto";
import { metaAuthorizationUrl } from "@/lib/connections/meta-provider";
import { createMetaRepository, MetaAccessError } from "@/lib/connections/meta-repository";
import { metaFailure, metaHeaders, metaStateCookie, metaStateCookieOptions } from "@/lib/connections/meta-http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession();
    const config = getMetaConfig();
    if (!config) throw new MetaAccessError("setup_pending");
    const repo = createMetaRepository(session.supabase, session.authorId, config);
    if (!await repo.ready()) throw new MetaAccessError("setup_pending");
    const state = newOAuthState();
    await repo.begin(stateHash(state));
    const response = NextResponse.redirect(metaAuthorizationUrl(config, state), { status: 303, headers: metaHeaders });
    response.cookies.set(metaStateCookie, state, metaStateCookieOptions);
    return response;
  } catch (error) { return metaFailure(error); }
}
