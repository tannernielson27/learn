/**
 * The roster a host's lobby shows, folded out of Realtime Presence (#132).
 *
 * Presence answers one question — which phones are connected *right now* — and answers it by
 * replacing the whole set on every sync. A lobby needs something slightly different: the story
 * asks that a participant who leaves "greys out", not that they vanish, because a phone that
 * locked in a student's pocket is still a person sitting in the room, and a name that disappears
 * from the front of the class reads as "they left" rather than "their screen went to sleep".
 *
 * So the console keeps everyone it has seen and marks each one present or away. That memory lives
 * for as long as the console is open and is never written anywhere: the roster is presence, not a
 * database read (ADR 0002 — the participants table is the host's to read, but reading it per sync
 * would be a query per phone per lock screen).
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { Participant } from "./transport";

/** One line in the lobby: a person, and whether their phone is connected at this moment. */
export interface RosterEntry extends Participant {
  present: boolean;
}

/**
 * How many people a console will remember at once.
 *
 * `private.session_is_full` caps a session at 300 participants (#129), so 300 is the most a
 * roster can honestly hold and the rest is headroom. The cap exists because the session's
 * presence channel is not a private one — a student has no Postgres identity for a
 * `realtime.messages` policy to speak for — so anything holding the publishable key and a session
 * id can track a presence entry, and a console that remembers everyone it has ever seen would
 * otherwise grow a row per forged entry for the rest of the class. Present phones are never
 * dropped; what is forgotten is the memory of who has gone away.
 */
export const ROSTER_LIMIT = 400;

/**
 * Folds one presence sync into the roster the console is holding. Never mutates either argument.
 *
 * Everyone in `present` is marked present, under the name their entry carries now; everyone the
 * console already knew who is not in `present` stays, marked away. `joinedAt` is taken from the
 * first entry the console ever saw for that person, so a phone that drops and comes back keeps
 * its place in the room rather than jumping to the end of the list.
 */
export function mergeRoster(
  known: readonly RosterEntry[],
  present: readonly Participant[],
): RosterEntry[] {
  const merged = new Map<string, RosterEntry>();
  for (const entry of known) merged.set(entry.participantId, { ...entry, present: false });

  for (const person of present) {
    const held = merged.get(person.participantId);
    merged.set(person.participantId, {
      participantId: person.participantId,
      displayName: person.displayName,
      joinedAt: held?.joinedAt ?? person.joinedAt,
      present: true,
    });
  }

  return [...keep(merged.values())].sort(
    (a, b) => a.joinedAt - b.joinedAt || a.participantId.localeCompare(b.participantId),
  );
}

/**
 * Trims the roster to `ROSTER_LIMIT`, if it has to.
 *
 * Two orderings decide who survives, and both matter. Connected phones come before remembered
 * ones, so a name at the front of the class never disappears because someone else is making
 * noise; and within each group the entries the console has known longest come first, which is
 * insertion order here — `mergeRoster` seeds the map from the roster it was already holding and
 * appends whoever is new — so what is forgotten is whatever arrived a moment ago.
 *
 * A room cannot hold more than 300 people, so a roster past the cap is not a full room: it is
 * noise, and cutting it off is the honest answer.
 */
function keep(entries: Iterable<RosterEntry>): RosterEntry[] {
  const held = [...entries];
  if (held.length <= ROSTER_LIMIT) return held;
  return [
    ...held.filter((entry) => entry.present),
    ...held.filter((entry) => !entry.present),
  ].slice(0, ROSTER_LIMIT);
}

/** How many phones are connected. This is the number the lobby shows beside the roster. */
export function countPresent(roster: readonly RosterEntry[]): number {
  return roster.reduce((count, entry) => (entry.present ? count + 1 : count), 0);
}
