import { extractUnit, extractUnitDeps } from "@/lib/aiImport/extractUnit";
import { extractUnitResponse } from "@/lib/aiImport/upload/extractRoute";
import { authorForRoute } from "@/lib/authoring/session";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** A case study unit makes several calls at once and may retry; the unit claim outlasts this. */
export const maxDuration = 300;

/** Extracts one unit of an AI import file into staged entries (#345). See `extractUnitResponse`. */
export async function POST(request: Request): Promise<Response> {
  return extractUnitResponse(request, {
    author: authorForRoute,
    service: createSupabaseServiceClient,
    extract: (service, unit) => extractUnit(extractUnitDeps(service), unit),
    unitDeps: extractUnitDeps,
    claims: () => sharedRateLimitStore(),
  });
}
