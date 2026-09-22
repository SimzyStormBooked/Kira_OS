import "server-only";
import { createHash, createHmac } from "node:crypto";
import { parseApplicationOrigin } from "@/lib/config";

export const META_READ_SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights", "instagram_basic", "instagram_manage_insights"] as const;
export const META_ALLOWED_SCOPES: readonly string[] = [...META_READ_SCOPES, "public_profile"];
export interface MetaConfig {
  appId: string; appSecret: string; loginConfigId: string; graphVersion: string;
  origin: string; callbackUrl: string; credentialKey: Buffer; serverProof: string;
}
export function getMetaConfig(env: Readonly<Record<string, string | undefined>> = process.env): MetaConfig | null {
  const appId = env.KIRA_META_APP_ID?.trim() ?? "";
  const appSecret = env.KIRA_META_APP_SECRET?.trim() ?? "";
  const loginConfigId = env.KIRA_META_LOGIN_CONFIG_ID?.trim() ?? "";
  const graphVersion = env.KIRA_META_GRAPH_VERSION?.trim() ?? "";
  const key = env.KIRA_META_CREDENTIAL_KEY?.trim() ?? "";
  const origin = parseApplicationOrigin(env.NEXT_PUBLIC_APP_URL ?? "");
  if (!/^[0-9]{5,30}$/.test(appId) || !/^[a-fA-F0-9]{32}$/.test(appSecret) || !/^[0-9]{5,30}$/.test(loginConfigId) ||
      !/^v[0-9]{2,3}\.0$/.test(graphVersion) || !/^[A-Za-z0-9+/]{43}=$/.test(key) || !origin || !origin.startsWith("https:")) return null;
  const credentialKey = Buffer.from(key, "base64");
  if (credentialKey.length !== 32 || credentialKey.toString("base64") !== key) return null;
  const serverProof = createHmac("sha256", credentialKey).update("KIRA_META_SERVER_CAPABILITY_V1").digest("hex");
  return { appId, appSecret, loginConfigId, graphVersion, origin, callbackUrl: `${origin}/api/connections/meta/callback`, credentialKey, serverProof };
}
/** App-wide revocation/deletion callbacks serve either configured connector; OAuth still requires its own login configuration. */
export function getMetaLifecycleConfig(env: Readonly<Record<string, string | undefined>> = process.env): MetaConfig | null {
  return getMetaConfig(env) ?? getMetaConfig({ ...env, KIRA_META_LOGIN_CONFIG_ID: env.KIRA_META_ADS_LOGIN_CONFIG_ID });
}
/** Provision only this hash in private.meta_connector_config; keep the key/proof server-only. */
export function metaCapabilityHash(config: MetaConfig): string {
  return createHash("sha256").update(config.serverProof).digest("hex");
}
