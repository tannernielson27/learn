import { liveRouteDeps } from "@/lib/liveSupabase/routeDeps";
import { submitSessionResponse } from "@/lib/liveSupabase/submitRoute";

/** Takes one answer, scores it on the server and writes it down. See `submitSessionResponse`. */
export async function POST(request: Request): Promise<Response> {
  return submitSessionResponse(request, liveRouteDeps());
}
