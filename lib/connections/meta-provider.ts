import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { META_READ_SCOPES, META_ALLOWED_SCOPES, type MetaConfig } from "./meta-config";
import { metaAccountSchema } from "./meta-schema";

export class MetaProviderError extends Error {
  constructor(public readonly code: "provider_unavailable" | "reconnect" | "permissions" | "no_accounts") { super(code); }
}
const id = z.string().regex(/^[0-9]{1,30}$/);
const accessToken = z.string().min(1).max(16000);
const tokenSchema = z.object({ access_token: accessToken, expires_in: z.number().positive().optional() });
export const metaCredentialSchema = z.object({ userToken: accessToken });

export async function graph(config: MetaConfig, path: string, parameters: Record<string, string>, token?: string, method = "GET"): Promise<unknown> {
  // Every path is constructed internally. Never follow provider pagination or caller URLs.
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${path}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  if (token) url.searchParams.set("appsecret_proof", createHmac("sha256", config.appSecret).update(token).digest("hex"));
  try {
    const response = await fetch(url, { method, headers: token ? { Authorization: `Bearer ${token}` } : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
    const reader = response.body?.getReader();
    if (!reader) throw new MetaProviderError("provider_unavailable");
    let length = 0, raw = "";
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 1048576) { await reader.cancel(); throw new MetaProviderError("provider_unavailable"); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    const body = JSON.parse(raw + decoder.decode()) as { error?: { code?: number } };
    if (!response.ok || body.error) {
      if (body.error?.code === 190 || response.status === 401) throw new MetaProviderError("reconnect");
      if ([10, 200].includes(body.error?.code ?? 0)) throw new MetaProviderError("permissions");
      throw new MetaProviderError("provider_unavailable");
    }
    return body;
  } catch (error) {
    if (error instanceof MetaProviderError) throw error;
    // Never expose URL, provider body, authorization code, token, or raw transport error.
    throw new MetaProviderError("provider_unavailable");
  }
}

export function metaAuthorizationUrl(config: MetaConfig, state: string): string {
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: config.appId, redirect_uri: config.callbackUrl, state,
    config_id: config.loginConfigId, response_type: "code", override_default_response_type: "true" }).toString();
  return url.href;
}
export async function exchangeMetaCode(config: MetaConfig, code: string) {
  const short = tokenSchema.parse(await graph(config, "oauth/access_token", { client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.callbackUrl, code }));
  const long = tokenSchema.parse(await graph(config, "oauth/access_token", { client_id: config.appId, client_secret: config.appSecret, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token }));
  return verifyMetaToken(config, long.access_token);
}
export async function verifyMetaToken(config: MetaConfig, userToken: string) {
  const result = z.object({ data: z.object({ type: z.literal("USER"), app_id: z.union([z.string(), z.number()]), user_id: id, is_valid: z.boolean(),
    expires_at: z.number().nonnegative(), data_access_expires_at: z.number().nonnegative().optional(), scopes: z.array(z.string()) }) }).parse(
    await graph(config, "debug_token", { input_token: userToken }, `${config.appId}|${config.appSecret}`),
  ).data;
  if (!result.is_valid || String(result.app_id) !== config.appId) throw new MetaProviderError("reconnect");
  if (META_READ_SCOPES.some(scope => !result.scopes.includes(scope)) || result.scopes.some(scope => !META_ALLOWED_SCOPES.includes(scope))) throw new MetaProviderError("permissions");
  const deadlines = [result.expires_at, result.data_access_expires_at ?? 0].filter(value => value > 0);
  // An unknown user-token lifetime is not represented as indefinite authorization.
  if (!deadlines.length) throw new MetaProviderError("reconnect");
  const expiresAt = Math.min(...deadlines) * 1000;
  if (expiresAt <= Date.now() + 60000) throw new MetaProviderError("reconnect");
  const me = z.object({ id }).parse(await graph(config, "me", { fields: "id" }, userToken));
  if (me.id !== result.user_id) throw new MetaProviderError("reconnect");
  const accounts = [];
  let after: string | undefined;
  for (let batch = 0; batch < 1; batch++) {
    const page = z.object({ data: z.array(z.object({ id, name: z.string().min(1).max(500), access_token: accessToken })),
      paging: z.object({ cursors: z.object({ after: z.string().max(2000).optional() }).optional(), next: z.string().optional() }).optional(),
    }).parse(await graph(config, "me/accounts", { fields: "id,name,access_token", limit: "25", ...(after ? { after } : {}) }, userToken));
    for (const account of page.data) {
      const checked = z.object({ id, name: z.string().min(1).max(500), instagram_business_account: z.object({ id, username: z.string().max(100).optional() }).optional() })
        .parse(await graph(config, account.id, { fields: "id,name,instagram_business_account{id,username}" }, account.access_token));
      if (checked.id !== account.id) throw new MetaProviderError("reconnect");
      accounts.push(metaAccountSchema.parse({ page_id: checked.id, page_name: checked.name, instagram_id: checked.instagram_business_account?.id ?? null, instagram_username: checked.instagram_business_account?.username ?? null }));
    }
    if (!page.paging?.next) break;
    after = page.paging.cursors?.after;
    if (!after || batch === 0) throw new MetaProviderError("provider_unavailable");
  }
  if (!accounts.length) throw new MetaProviderError("no_accounts");
  return { metaUserId: me.id, userToken, accounts, scopes: result.scopes, expiresAt: new Date(expiresAt).toISOString() };
}
export async function revokeMetaToken(config: MetaConfig, token: string) {
  await graph(config, "me/permissions", {}, token, "DELETE");
}
