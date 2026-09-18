import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function stateHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function newOAuthState(): string { return randomBytes(32).toString("base64url"); }
export function equalOAuthState(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual || !/^[A-Za-z0-9_-]{43}$/.test(actual) || !/^[A-Za-z0-9_-]{43}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
export function encryptMetaCredential(value: unknown, key: Buffer, authorId: string, metaUserId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`kira-meta:v1:${authorId}:${metaUserId}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptMetaCredential(value: string, key: Buffer, authorId: string, metaUserId: string): unknown {
  const [version, nonce, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || extra || !nonce || !tag || !ciphertext) throw new Error("Invalid stored authorization");
  const iv = Buffer.from(nonce, "base64url"), authTag = Buffer.from(tag, "base64url");
  if (iv.length !== 12 || authTag.length !== 16) throw new Error("Invalid stored authorization");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(`kira-meta:v1:${authorId}:${metaUserId}`));
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as unknown;
}

/** Verify Meta's signed request before honoring a provider deauthorization/deletion event. */
export function signedMetaUser(value: string, appSecret: string): string {
  const [signature, payload, extra] = value.split(".");
  if (extra || !signature || !payload || value.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(signature) || !/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error("Invalid provider signature");
  const actual = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid provider signature");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  if (data.algorithm !== "HMAC-SHA256" || typeof data.user_id !== "string" || !/^[0-9]{1,30}$/.test(data.user_id)) throw new Error("Invalid provider identity");
  return data.user_id;
}
