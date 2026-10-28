import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { readSupabasePublicEnv } from "./env";

/** Supabase client for Client Components. Sessions live in cookies shared with the server. */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = readSupabasePublicEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
