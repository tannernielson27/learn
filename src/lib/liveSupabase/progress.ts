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

export async function readProgress(
  client: SupabaseClient<Database>,
  sessionId: string,
  itemCount: number,
): Promise<SessionProgress | null> {
  const [people, answers] = await Promise.all([
    client.from("participants").select("id, display_name, joined_at").eq("session_id", sessionId),
    client
      .from("session_responses")
      .select("participant_id, item_position")
      .eq("session_id", sessionId),
  ]);
  if (people.error || answers.error) return null;

  const answered = Array.from({ length: itemCount }, () => 0);
  const byPerson = new Map<string, Set<number>>();
  for (const answer of answers.data ?? []) {
    const position = Number(answer.item_position);
    if (!Number.isInteger(position) || position < 1 || position > itemCount) continue;
    answered[position - 1] = (answered[position - 1] ?? 0) + 1;
    const held = byPerson.get(answer.participant_id) ?? new Set<number>();
    byPerson.set(answer.participant_id, held.add(position));
  }

  const rows: ProgressRow[] = [...(people.data ?? [])]
    .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at) || a.id.localeCompare(b.id))
    .map((person) => ({
      participantId: person.id,
      displayName: person.display_name,
      positions: [...(byPerson.get(person.id) ?? [])].sort((a, b) => a - b),
    }));
  return { answered, rows };
}
