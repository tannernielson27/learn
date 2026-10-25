import type { SupabaseClient } from "@supabase/supabase-js";
import { readSetItems } from "@/lib/supabase/attempts";
import type { Database } from "@/lib/supabase/database.types";
import { readMyLiveResult } from "@/lib/supabase/liveResults";
import type { LiveResultsStore } from "./liveResultPage";

type Client = SupabaseClient<Database>;

/**
 * A live session results page's reads. `user` reads the student's own result as the signed-in
 * student, through a definer function that answers only once the session has ended and only about
 * a participant linked to them; `service` makes the service role client that reads the items with
 * their keys. It is called only when the items are read, which is only after that read has found
 * the result (see `loadLiveResultPage`), so a not-found page never builds one.
 */
export function liveResultsStore(user: Client, service: () => Client): LiveResultsStore {
  return {
    result: (sessionId) => readMyLiveResult(user, sessionId),
    items: (ids) => readSetItems(service(), ids),
  };
}
