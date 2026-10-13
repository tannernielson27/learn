/**
 * The student-paced progress board's read (#185): who has joined, and which items each of them has
 * answered. Answered or not, and nothing more.
 *
 * Read by the host, under their own org's row level security (`authors read their org's
 * participants`, `authors read their org's session responses`), on the tally's three-second
 * cadence: a pull, never a push, so a class answering twenty items sends nothing over Realtime
 * (ADR 0002). Two columns are selected from the responses and two are all that could be — the
 * participant and the position. Not the response, not the points: a board on a projector that
 * coloured a cell right or wrong before "Show answers" would give the answer away.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressRow, SessionProgress } from "@/lib/live";
import type { Database } from "@/lib/supabase/database.types";
import { readAllPages } from "@/lib/supabase/sessionReport";

type Client = SupabaseClient<Database>;

interface AnswerRow {
  participant_id: string;
  item_position: number;
}

interface PersonRow {
  id: string;
  display_name: string;
  joined_at: string;
}

/**
 * Everyone who has joined, or null when the read failed, whether it answered with an error or
 * never answered at all. One read: a session holds at most 300 people, well under `max_rows`.
 */
async function readRoster(client: Client, sessionId: string): Promise<PersonRow[] | null> {
  try {
    const { data, error } = await client
      .from("participants")
      .select("id, display_name, joined_at")
      .eq("session_id", sessionId);
    return error ? null : (data ?? []);
  } catch {
    return null;
  }
}

/**
 * Every answer in the session, or null when a read failed.
 *
 * One row per person per item, so a full class on a long set is past PostgREST's `max_rows` and a
 * single read would be cut short without a word (#406): 110 people on item 10 is already 1,100
 * rows. Read a page at a time, as the report reads them, which is still one request for a class
 * under the cap. The roster needs none of this: a session holds at most 300 people.
 *
 * Ordered by the columns of `session_responses_once`, which no two of a session's rows share, so
 * every row has one place in the order and the pages are cut from the same list each time. An
 * answer written between two page reads can only push later rows further along: a row may then
 * come back on two pages (`positionsByPerson` counts it once), but none is passed over. Only a
 * delete between pages could pull a row back past the cursor, and nothing deletes an answer while
 * its session is live.
 */
async function readAnswers(client: Client, sessionId: string): Promise<AnswerRow[] | null> {
  try {
    return await readAllPages<AnswerRow>(
      (from, to) =>
        client
          .from("session_responses")
          .select("participant_id, item_position")
          .eq("session_id", sessionId)
          .order("participant_id")
          .order("item_position")
          .range(from, to),
      "progress",
    );
  } catch {
    return null;
  }
}

/**
 * The items each person has answered, keyed by person. A set, not a count: an answer written
 * between two page reads, at a place the cursor has already passed, moves the rows after it along
 * by one, and the next page then opens with the row the last one closed on. Counted from sets,
 * that row is still one answer. The new answer itself is not in this read; the next poll has it.
 */
function positionsByPerson(
  answers: readonly AnswerRow[],
  itemCount: number,
): Map<string, Set<number>> {
  const byPerson = new Map<string, Set<number>>();
  for (const answer of answers) {
    const position = Number(answer.item_position);
    if (!Number.isInteger(position) || position < 1 || position > itemCount) continue;
    const held = byPerson.get(answer.participant_id) ?? new Set<number>();
    byPerson.set(answer.participant_id, held.add(position));
  }
  return byPerson;
}

/** How many people have answered each item, first item first. */
function answeredPerItem(byPerson: Map<string, Set<number>>, itemCount: number): number[] {
  const answered = Array.from({ length: itemCount }, () => 0);
  for (const positions of byPerson.values()) {
    for (const position of positions) answered[position - 1] = (answered[position - 1] ?? 0) + 1;
  }
  return answered;
}

export async function readProgress(
  client: Client,
  sessionId: string,
  itemCount: number,
): Promise<SessionProgress | null> {
  const [people, answers] = await Promise.all([
    readRoster(client, sessionId),
    readAnswers(client, sessionId),
  ]);
  if (people === null || answers === null) return null;

  const byPerson = positionsByPerson(answers, itemCount);
  const rows: ProgressRow[] = [...people]
    .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at) || a.id.localeCompare(b.id))
    .map((person) => ({
      participantId: person.id,
      displayName: person.display_name,
      positions: [...(byPerson.get(person.id) ?? [])].sort((a, b) => a - b),
    }));
  return { answered: answeredPerItem(byPerson, itemCount), rows };
}
