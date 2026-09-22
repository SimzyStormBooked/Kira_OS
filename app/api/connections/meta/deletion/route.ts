import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
    await revokeMetaIdentity(await createWorkspaceSupabaseClient(), config, userId, true);
    const nonce = randomBytes(24).toString("base64url");
    const signature = createHmac("sha256", config.serverProof).update(`deletion:${nonce}`).digest("base64url");
    const code = `${nonce}.${signature}`;
    return NextResponse.json({ url: `${config.origin}/api/connections/meta/deletion?code=${code}`, confirmation_code: code }, { headers: metaHeaders });
  } catch { return NextResponse.json({ error: "Please retry this event." }, { status: 503, headers: metaHeaders }); }
}
export async function GET(request: Request) {
  const config = getMetaLifecycleConfig();
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const [nonce, signature, extra] = code.split(".");
  if (!config || extra || !/^[A-Za-z0-9_-]{32}$/.test(nonce ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(signature ?? ""))
    return NextResponse.json({ error: "Receipt not found." }, { status: 404, headers: metaHeaders });
  const expected = createHmac("sha256", config.serverProof).update(`deletion:${nonce}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Receipt not found." }, { status: 404, headers: metaHeaders });
  return NextResponse.json({ status: "completed", message: "KIRA’s saved Meta authorization and account metadata were deleted. Manually saved profile links are separate workspace records." }, { headers: metaHeaders });
}
