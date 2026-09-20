/**
 * What one session's Realtime Presence state means, in one place.
 *
 * Three connections read the same channel's presence and all three want the same answer: the host
 * console (#131), a participant's transport (#131) and a participant's room (#132). They had two
 * copies of this fold between them; a third would have been the point at which "who is in the
 * room" started meaning slightly different things on different screens.
 *
 * A presence entry carries a name and nothing else. It is not a list of who answered what, and it
 * is deliberately not read from `public.participants`: the roster is presence (ADR 0002), so a
 * phone locking in a pocket costs nothing but a sync.
 */
import type { Participant } from "@/lib/live";

/** One person's presence entry, as every connection on this channel tracks it. */
export interface PresenceEntry {
  participantId: string;
  displayName: string;
  /** Epoch milliseconds, from a server's clock rather than the phone's. */
  joinedAt: number;
}

/**
 * Folds a channel's presence state into a roster.
 *
 * `self` is folded in when it is not already there. Presence can lag a fraction behind a
 * successful `track`, and a screen that answered with an empty room containing everyone but you
 * reads as a failure to join rather than as a sync that has not landed yet.
 *
 * Entries arrive over a socket, so `participantId` is checked rather than trusted; an entry
 * without one is not a person and is dropped.
 */
export function rosterFrom(
  tracked: Record<string, PresenceEntry[]>,
  self: Participant | null = null,
): Participant[] {
  const people = new Map<string, Participant>();
  for (const entries of Object.values(tracked)) {
    for (const entry of entries) {
      if (typeof entry.participantId !== "string") continue;
      people.set(entry.participantId, {
        participantId: entry.participantId,
        displayName: entry.displayName,
        joinedAt: entry.joinedAt,
      });
    }
  }
  if (self !== null && !people.has(self.participantId)) people.set(self.participantId, self);

  return [...people.values()].sort(
    (a, b) => a.joinedAt - b.joinedAt || a.participantId.localeCompare(b.participantId),
  );
}
