import { liveRouteDeps, readParticipantView } from "@/lib/liveSupabase";

/**
 * What a participant's page is allowed to know right now. POST rather than GET so nothing that may
 * carry an answer key can be prerendered or cached. See `readParticipantView`.
 */
export async function POST(request: Request): Promise<Response> {
  return readParticipantView(request, liveRouteDeps());
}
