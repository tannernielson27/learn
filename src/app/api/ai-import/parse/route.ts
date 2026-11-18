import { segmentChunk, segmentChunkDeps } from "@/lib/aiImport/segmentChunk";
import { parseChunkResponse } from "@/lib/aiImport/upload/parseRoute";
import { authorForRoute } from "@/lib/authoring/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * A chunk's call may run 130 s, and a chunk whose answer overflows is read again as two halves
 * at once (#590): two rounds, cut to end inside `SEGMENT_BUDGET_MS`. The chunk claim outlasts this.
 */
export const maxDuration = 300;

/** Reads one chunk of an AI import file (#345). See `parseChunkResponse`. */
export async function POST(request: Request): Promise<Response> {
  return parseChunkResponse(request, {
    author: authorForRoute,
    service: createSupabaseServiceClient,
    segment: (service, chunk) => segmentChunk(segmentChunkDeps(service), chunk),
  });
}
