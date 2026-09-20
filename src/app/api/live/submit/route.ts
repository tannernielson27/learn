import { liveRouteDeps, submitSessionResponse } from "@/lib/liveSupabase";

/** Takes one answer, scores it on the server and writes it down. See `submitSessionResponse`. */
export async function POST(request: Request): Promise<Response> {
  return submitSessionResponse(request, liveRouteDeps());
}
