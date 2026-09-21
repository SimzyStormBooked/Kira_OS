import "server-only";
import { z } from "zod";
import { decryptMetaCredential } from "@/lib/connections/meta-crypto";
import { MetaProviderError } from "@/lib/connections/meta-provider";
import { adsConfig, fetchAds } from "./meta";
import { addBookAwareIdeas } from "./intelligence";
import { adsWorker } from "./repository";
export async function processAdsReport(id: string, run: string): Promise<string[]> {
  try {
    const config = adsConfig(); if (!config) throw new Error("Setup pending");
    const item = await adsWorker("claim", id, run); if (!item) return [];
    const credential = z.object({ token: z.string() }).parse(decryptMetaCredential(item.ciphertext, config.credentialKey, item.authorId, item.metaUserId));
    const fetched = await fetchAds(config, credential.token, item.accountId);
    const snapshot = await addBookAwareIdeas(fetched, item.books, id, item.allowAi);
    const ids = await adsWorker("finish", id, run, { snapshot });
    return z.uuid().array().max(100).parse(ids);
  } catch (error) { await adsWorker("fail", id, run, { code: error instanceof MetaProviderError ? error.code : "interrupted" }).catch(() => {}); return []; }
}
