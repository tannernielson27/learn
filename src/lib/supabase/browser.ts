import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readSupabasePublicEnv } from "./env";

/** Supabase client for Client Components. Sessions live in cookies shared with the server. */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = readSupabasePublicEnv();
  return createBrowserClient<Database>(url, publishableKey);
}

/**
 * The client a student's phone opens its session's channel with (#149).
 *
 * A student has no Supabase account, so there is no session for `createBrowserClient` to keep in
 * cookies. What authorizes the socket instead is `accessToken`: this participant's channel token,
 * which supabase-js presents to Realtime on connect and asks for again on every heartbeat. With
 * the callback set, supabase-js never listens for auth events and refuses every `auth` method, so
 * nothing else can replace the token behind its back.
 *
 * Used for Realtime and nothing else. The token's role is `anon`, so even a Data API call made on
 * this client could reach no more than the publishable key already does.
 */
export function createSupabaseChannelClient(accessToken: () => Promise<string>) {
  const { url, publishableKey } = readSupabasePublicEnv();
  return createClient<Database>(url, publishableKey, { accessToken });
}
