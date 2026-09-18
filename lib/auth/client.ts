import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getWorkspaceConfig } from "@/lib/config";
import { WorkspaceAccessError } from "./errors";

/** A fresh, user-scoped client per request. The application never needs a service-role key. */
export async function createWorkspaceSupabaseClient(
  { writableCookies = false }: { writableCookies?: boolean } = {},
) {
  const config = getWorkspaceConfig();
  if (config.mode !== "connected" || !config.configured ||
    !config.supabaseUrl || !config.supabasePublishableKey) {
    throw new WorkspaceAccessError(503, "unconfigured", "The private workspace connection is not ready yet.");
  }
  const cookieStore = await cookies();
  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        // Server Components cannot write cookies. Proxy already renews them before rendering.
        if (!writableCookies) return;
        for (const { name, value, options } of values) cookieStore.set(name, value, options);
      },
    },
  });
}
