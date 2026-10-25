import type { SupabaseClient } from "@supabase/supabase-js";
import { readSetItems } from "@/lib/supabase/attempts";
import type { Database } from "@/lib/supabase/database.types";
import { readMyLiveResult } from "@/lib/supabase/liveResults";
import type { LiveResultsStore } from "./liveResultPage";

type Client = SupabaseClient<Database>;

/**
 * A live session results page's reads. `user` reads the student's own result as the signed-in
 * student, through a definer function that answers only once the session has ended and only about
 * a participant linked to them; `service` reads the items with their keys, and only after that
 * read has found the result (see `loadLiveResultPage`).
 */
export function liveResultsStore(user: Client, service: Client): LiveResultsStore {
  return {
    result: (sessionId) => readMyLiveResult(user, sessionId),
    items: (ids) => readSetItems(service, ids),
  };
}
