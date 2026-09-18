import { NextResponse } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/security";
import { getMetaConfig } from "@/lib/connections/meta-config";
import { createMetaRepository, loadMetaView, MetaAccessError } from "@/lib/connections/meta-repository";
import { verifyMetaToken, revokeMetaToken, MetaProviderError } from "@/lib/connections/meta-provider";
import { metaFailure, metaHeaders } from "@/lib/connections/meta-http";
export async function GET() {
  try {
    const session = await requireWorkspaceSession();
    return NextResponse.json(await loadMetaView(session.supabase, session.authorId, session.user.id), { headers: metaHeaders });
  } catch (error) { return metaFailure(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession(); const config = getMetaConfig();
    if (!config) throw new MetaAccessError("setup_pending");
    const repo = createMetaRepository(session.supabase, session.authorId, config);
    let expectedCiphertext: string | undefined;
    try {
      const credential = await repo.credential();
      expectedCiphertext = credential.expectedCiphertext;
      await repo.save(await verifyMetaToken(config, credential.userToken), { expectedCiphertext: credential.expectedCiphertext });
    }
    catch (error) {
      if (expectedCiphertext && error instanceof MetaProviderError && ["reconnect", "permissions", "no_accounts"].includes(error.code)) await repo.remove(false, expectedCiphertext);
      throw error;
    }
    return NextResponse.json(await loadMetaView(session.supabase, session.authorId, session.user.id), { headers: metaHeaders });
  } catch (error) { return metaFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireWorkspaceSession(); const config = getMetaConfig();
    if (!config) throw new MetaAccessError("setup_pending");
    const repo = createMetaRepository(session.supabase, session.authorId, config);
    // Credential lookup checks owner+server capability before any provider action.
    let token: string | null = null;
    try { token = (await repo.credential()).userToken; }
    catch (error) { if (!(error instanceof MetaAccessError && error.code === "reconnect")) throw error; }
    let providerRevoked = false;
    if (token) { try { await revokeMetaToken(config, token); providerRevoked = true; } catch { /* Local disconnect still completes. */ } }
    await repo.remove(true);
    return NextResponse.json({ disconnected: true, providerRevoked }, { headers: metaHeaders });
  } catch (error) { return metaFailure(error); }
}
