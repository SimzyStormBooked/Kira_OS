import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PasswordSetupEligibility =
  | { eligible: true; expiresAt: number }
  | { eligible: false; reason: "recent_link_required" | "unavailable" };

/** Call only after server-side identity and workspace membership verification. */
export async function getPasswordSetupEligibility(
  session: { user: { id: string }; supabase: SupabaseClient },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<PasswordSetupEligibility> {
  const denied = { eligible: false, reason: "recent_link_required" } as const;
  try {
    // getClaims verifies the signature and expiry; decoded cookie data is never proof.
    const { data, error } = await session.supabase.auth.getClaims();
    if (error) return { eligible: false, reason: "unavailable" };
    const claims = data?.claims;
    if (!claims || claims.sub !== session.user.id || claims.is_anonymous === true ||
      !Number.isFinite(nowSeconds) || !Number.isInteger(claims.exp) || claims.exp <= nowSeconds ||
      !Array.isArray(claims.amr)) return denied;
    let latestProof: number | null = null;
    for (const entry of claims.amr) {
      // String-only AMR and a newly refreshed JWT cannot prove when sign-in occurred.
      if (!entry || typeof entry !== "object" ||
        (entry.method !== "otp" && entry.method !== "magiclink") ||
        !Number.isInteger(entry.timestamp) || entry.timestamp < nowSeconds - 900 ||
        entry.timestamp > nowSeconds + 30) continue;
      latestProof = Math.max(latestProof ?? entry.timestamp, entry.timestamp);
    }
    return latestProof === null ? denied : { eligible: true, expiresAt: Math.min(claims.exp, latestProof + 900) };
  } catch {
    return { eligible: false, reason: "unavailable" };
  }
}
