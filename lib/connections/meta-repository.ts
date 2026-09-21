import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getMetaConfig, type MetaConfig } from "./meta-config";
import { decryptMetaCredential, encryptMetaCredential } from "./meta-crypto";
import { metaConnectionSchema, type MetaView } from "./meta-schema";
import { metaCredentialSchema, type verifyMetaToken } from "./meta-provider";
import { parseApplicationOrigin } from "@/lib/config";

export class MetaAccessError extends Error {
  constructor(public readonly code: "setup_pending" | "owner_required" | "invalid_state" | "unavailable" | "reconnect") { super(code); }
}
export function createMetaRepository(supabase: SupabaseClient, authorId: string, config: MetaConfig) {
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.rpc(name, { p_author_id: authorId, p_server_proof: config.serverProof, ...args });
    if (error) throw new MetaAccessError(error.code === "42501" ? "owner_required" : error.code === "22023" ? "invalid_state" : "unavailable");
    return data as T;
  }
  return {
    ready: () => rpc<boolean>("meta_connector_ready"),
    begin: (hash: string) => rpc<null>("begin_meta_authorization", { p_state_hash: hash }),
    consume: (hash: string) => rpc<null>("consume_meta_authorization", { p_state_hash: hash }),
    async save(verified: Awaited<ReturnType<typeof verifyMetaToken>>, condition: { stateHash: string } | { expectedCiphertext: string }) {
      const ciphertext = encryptMetaCredential({ userToken: verified.userToken }, config.credentialKey, authorId, verified.metaUserId);
      await rpc<null>("save_meta_authorization", { p_meta_user_id: verified.metaUserId, p_ciphertext: ciphertext, p_expires_at: verified.expiresAt, p_scopes: verified.scopes, p_accounts: verified.accounts,
        p_state_hash: "stateHash" in condition ? condition.stateHash : null, p_expected_ciphertext: "expectedCiphertext" in condition ? condition.expectedCiphertext : null });
    },
    async credential() {
      const raw = await rpc<unknown>("read_meta_credential");
      if (!raw) throw new MetaAccessError("reconnect");
      const saved = z.object({ ciphertext: z.string(), meta_user_id: z.string(), expires_at: z.string() }).parse(raw);
      if (Date.parse(saved.expires_at) <= Date.now()) {
        await rpc<null>("remove_meta_authorization", { p_remove_metadata: false, p_expected_ciphertext: saved.ciphertext });
        throw new MetaAccessError("reconnect");
      }
      try { return { ...metaCredentialSchema.parse(decryptMetaCredential(saved.ciphertext, config.credentialKey, authorId, saved.meta_user_id)), expectedCiphertext: saved.ciphertext }; }
      catch { await rpc<null>("remove_meta_authorization", { p_remove_metadata: false, p_expected_ciphertext: saved.ciphertext }); throw new MetaAccessError("reconnect"); }
    },
    remove: (removeMetadata: boolean, expectedCiphertext?: string) => rpc<null>("remove_meta_authorization", { p_remove_metadata: removeMetadata, p_expected_ciphertext: expectedCiphertext ?? null }),
  };
}

/** All page props are deliberately nonsecret. Never pass a config or repository result through directly. */
export async function loadMetaView(supabase: SupabaseClient, authorId: string, userId: string): Promise<MetaView> {
  const { data: author, error: ownerError } = await supabase.from("authors").select("owner_user_id").eq("id", authorId).maybeSingle();
  const isOwner = !ownerError && author?.owner_user_id === userId;
  const config = getMetaConfig();
  const view: MetaView = { configured: false, isOwner, connection: null };
  const appOrigin = parseApplicationOrigin(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (isOwner && appOrigin) view.callbackUrl = `${appOrigin}/api/connections/meta/callback`;
  const { data, error } = await supabase.from("meta_authorizations")
    .select("author_id,authorized_by,meta_user_id,status,scopes,expires_at,connected_at,last_checked_at,accounts")
    .eq("author_id", authorId).maybeSingle();
  if (error) return { ...view, unavailable: true };
  if (data) {
    const parsed = metaConnectionSchema.safeParse(data);
    if (!parsed.success) return { ...view, unavailable: true };
    view.connection = parsed.data;
    if (Date.parse(parsed.data.expires_at) <= Date.now()) view.connection.status = "needs_reconnect";
  }
  if (isOwner && config) {
    try { view.configured = await createMetaRepository(supabase, authorId, config).ready(); }
    catch { view.unavailable = true; }
  }
  return view;
}

/** Provider-signed revocation uses a fresh caller-scoped publishable client, never a service role. */
export async function revokeMetaIdentity(supabase: SupabaseClient, config: MetaConfig, metaUserId: string, deleteData: boolean) {
  const { error } = await supabase.rpc("revoke_meta_identity", { p_server_proof: config.serverProof, p_meta_user_id: metaUserId, p_delete_data: deleteData });
  if (error) throw new MetaAccessError("unavailable");
  const { adsWorker } = await import("@/lib/ads/repository");
  await adsWorker("revoke", null, null, { metaUserId });
}
