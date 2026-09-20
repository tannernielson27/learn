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

  return [...merged.values()].sort(
    (a, b) => a.joinedAt - b.joinedAt || a.participantId.localeCompare(b.participantId),
  );
}

/** How many phones are connected. This is the number the lobby shows beside the roster. */
export function countPresent(roster: readonly RosterEntry[]): number {
  return roster.reduce((count, entry) => (entry.present ? count + 1 : count), 0);
}
