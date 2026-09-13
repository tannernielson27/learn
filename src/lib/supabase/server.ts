import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { readSupabasePublicEnv } from "./env";

/**
 * Supabase client for Server Components, Server Functions and Route Handlers. Create one per
 * request; never share it. Runs as the signed-in user, so row level security applies.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = readSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The request proxy refreshes the session
          // before render (added with sign-in, #66), so a skipped write here is harmless.
        }
      },
    },
  });
}
