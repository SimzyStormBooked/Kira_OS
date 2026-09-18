import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { getMetaConfig } from "@/lib/connections/meta-config";
import { equalOAuthState, stateHash } from "@/lib/connections/meta-crypto";
import { exchangeMetaCode, MetaProviderError } from "@/lib/connections/meta-provider";
import { createMetaRepository, MetaAccessError } from "@/lib/connections/meta-repository";
import { metaHeaders, metaStateCookie, metaStateCookieOptions } from "@/lib/connections/meta-http";

export async function GET(request: NextRequest) {
  const config = getMetaConfig();
  // A configured origin is required; never redirect to an untrusted Host header.
  if (!config) return NextResponse.json({ error: "Meta authorization setup is pending." }, { status: 503, headers: metaHeaders });
  let outcome = "failed";
  try {
    const session = await requireWorkspaceSession();
    const state = request.nextUrl.searchParams.get("state");
    if (!equalOAuthState(request.cookies.get(metaStateCookie)?.value, state)) throw new MetaAccessError("invalid_state");
    const repo = createMetaRepository(session.supabase, session.authorId, config);
    await repo.consume(stateHash(state!));
    if (request.nextUrl.searchParams.has("error")) outcome = "cancelled";
    else {
      const code = request.nextUrl.searchParams.get("code");
      if (!code || code.length > 4096) throw new MetaAccessError("invalid_state");
      await repo.save(await exchangeMetaCode(config, code), { stateHash: stateHash(state!) });
      outcome = "authorized";
    }
  } catch (error) {
    outcome = error instanceof MetaAccessError || error instanceof MetaProviderError ? error.code : "failed";
  }
  const response = NextResponse.redirect(`${config.origin}/connections?meta=${encodeURIComponent(outcome)}`, { status: 303, headers: metaHeaders });
  response.cookies.set(metaStateCookie, "", { ...metaStateCookieOptions, maxAge: 0 });
  return response;
}
