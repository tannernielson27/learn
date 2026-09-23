import { issueChannelToken } from "@/lib/liveSupabase/channelRoute";
import { liveRouteDeps } from "@/lib/liveSupabase/routeDeps";
import { readChannelSigningKey } from "@/lib/supabase/channelToken";

/**
 * A fresh Realtime channel token for the participant the cookie names (#149). POST, like the other
 * two participant routes, so nothing here is ever prerendered or cached. See `issueChannelToken`.
 *
 * Imported module by module rather than through `@/lib/liveSupabase`: that barrel is also loaded
 * by the host console in the browser, and the signing code here is `node:crypto`.
 */
export async function POST(request: Request): Promise<Response> {
  return issueChannelToken(request, { ...liveRouteDeps(), signingKey: readChannelSigningKey });
}
