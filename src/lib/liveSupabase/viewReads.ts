/**
 * The item and answer reads of `POST /api/live/view`, as two selects (#131, #185).
 *
 * Since #407 this is the fallback. `open_session_view` hands the route these same rows in the
 * call that checks the participant, and these selects run only against a database that does not
 * have that function yet (`viewRoute.ts`). They read the same columns the function reads and hand
 * back the same rows, so `viewEntries` cannot tell which of the two it was given.
 *
 * Two reads, however long the set, and sent together: neither needs the other's answer.
 *
 * A read that fails is reported as failed. It used not to be on the one-item path: an answer that
 * could not be read came back as "not answered", which put a blank form in front of a student who
 * had already answered, and marks that could not be read came back as "did not answer".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { selectWithReveal } from "./scoredReveal";
import type { WantedItem } from "./viewEntries";

const ITEM_COLUMNS = "id, type, cjmm_step, tags, version, content, answer_key, rationale, scoring";
/** What a participant may have read back before the reveal: what they sent, and when. */
const ANSWER_COLUMNS = "item_position, response, submitted_at";
/** And after it, their own marks too. */
const MARKED_COLUMNS = `${ANSWER_COLUMNS}, points, max_points, model, breakdown, groups`;

/** The rows a view is built from, keys and all. Never forwarded: see `viewEntries`. */
export interface ViewRows {
  items: readonly unknown[];
  answers: readonly unknown[];
}

/** The rows, or which read failed and how, for the log. */
export type ViewRowsResult =
  | { ok: true; rows: ViewRows }
  | { ok: false; call: "items" | "session_responses"; error: unknown; status?: number };

export interface ViewRowsQuery {
  sessionId: string;
  participantId: string;
  wanted: readonly WantedItem[];
  /** A student-paced set reads every answer; a room on one item reads the answer at its place. */
  wholeSet: boolean;
  reveal: boolean;
}

export async function selectViewRows(
  service: SupabaseClient<Database>,
  query: ViewRowsQuery,
): Promise<ViewRowsResult> {
  const readItems = service
    .from("items")
    .select(ITEM_COLUMNS)
    .in(
      "id",
      query.wanted.map((item) => item.id),
    );

  const readAnswers = (columns: string) => {
    const mine = service
      .from("session_responses")
      .select(columns)
      .eq("session_id", query.sessionId)
      .eq("participant_id", query.participantId);
    const position = query.wanted[0]?.position;
    return query.wholeSet || position === undefined ? mine : mine.eq("item_position", position);
  };
  // Before the reveal, what they sent and nothing that was scored: not the marks, and not the key
  // they were scored with. After it, both (`scoredReveal.ts`).
  const answersRead = query.reveal
    ? selectWithReveal(MARKED_COLUMNS, readAnswers)
    : readAnswers(ANSWER_COLUMNS);

  const [items, answers] = await Promise.all([readItems, answersRead]);
  if (items.error) {
    return { ok: false, call: "items", error: items.error, status: items.status };
  }
  if (answers.error) {
    return { ok: false, call: "session_responses", error: answers.error, status: answers.status };
  }
  return { ok: true, rows: { items: items.data ?? [], answers: answers.data ?? [] } };
}
