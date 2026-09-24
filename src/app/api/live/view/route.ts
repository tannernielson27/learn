import { liveRouteDeps, readParticipantView } from "@/lib/liveSupabase";
import { secretStartingOrderSeed } from "@/lib/supabase/startingOrderSeed";

/**
 * What a participant's page is allowed to know right now. POST rather than GET so nothing that may
 * carry an answer key can be prerendered or cached. See `readParticipantView`. The starting-order
 * seed is keyed with the server's secret (#219), so a student cannot replay the scramble.
 */
export async function POST(request: Request): Promise<Response> {
  return readParticipantView(request, {
    ...liveRouteDeps(),
    startingOrderSeed: secretStartingOrderSeed,
  });
}
