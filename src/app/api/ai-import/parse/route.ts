import { segmentChunk, segmentChunkDeps } from "@/lib/aiImport/segmentChunk";
import { parseChunkResponse } from "@/lib/aiImport/upload/parseRoute";
import { authorForRoute } from "@/lib/authoring/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** A chunk's Claude call retries up to twice, 90 s each; the chunk claim outlasts this. */
export const maxDuration = 300;

/** Reads one chunk of an AI import file (#345). See `parseChunkResponse`. */
export async function POST(request: Request): Promise<Response> {
  return parseChunkResponse(request, {
    author: authorForRoute,
    service: createSupabaseServiceClient,
    segment: (service, chunk) => segmentChunk(segmentChunkDeps(service), chunk),
  });
}
