import { NextResponse } from "next/server";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { getMetaLifecycleConfig } from "@/lib/connections/meta-config";
import { signedMetaUser } from "@/lib/connections/meta-crypto";
import { revokeMetaIdentity } from "@/lib/connections/meta-repository";
import { metaHeaders, readSmallBody } from "@/lib/connections/meta-http";

export async function POST(request: Request) {
  const config = getMetaLifecycleConfig();
  if (!config) return NextResponse.json({ error: "Setup pending." }, { status: 503, headers: metaHeaders });
  let userId: string;
  try { userId = signedMetaUser(new URLSearchParams(await readSmallBody(request)).get("signed_request") ?? "", config.appSecret); }
  catch { return NextResponse.json({ error: "Invalid provider signature." }, { status: 400, headers: metaHeaders }); }
  try {
    await revokeMetaIdentity(await createWorkspaceSupabaseClient(), config, userId, false);
    return NextResponse.json({ success: true }, { headers: metaHeaders });
  } catch { return NextResponse.json({ error: "Please retry this event." }, { status: 503, headers: metaHeaders }); }
}
