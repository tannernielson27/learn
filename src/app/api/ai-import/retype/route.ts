import { retypeDeps, retypeEntry } from "@/lib/aiImport/review/retype";
import { retypeResponse } from "@/lib/aiImport/review/retypeRoute";
import { authorForRoute } from "@/lib/authoring/session";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** One question read again, with its one repair; the version's claim outlasts this. */
export const maxDuration = 300;

/** Changes one staged question's type and reads it again (#346). See `retypeResponse`. */
export async function POST(request: Request): Promise<Response> {
  return retypeResponse(request, {
    author: authorForRoute,
    service: createSupabaseServiceClient,
    retype: (service, retype) => retypeEntry(retypeDeps(service), retype),
    claims: () => sharedRateLimitStore(),
  });
}
