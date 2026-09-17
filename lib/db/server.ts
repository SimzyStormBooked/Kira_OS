import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
/** Reserved for the authenticated repository adapter. Never uses a service-role key. */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Supabase credentials are not configured. The demo remains available.",
    );
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        for (const { name, value, options } of values)
          cookieStore.set(name, value, options);
      },
    },
  });
}
