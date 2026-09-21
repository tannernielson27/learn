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
import {
  DISPLAY_NAME_MAX_LENGTH,
  cleanDisplayName,
  displayNameLength,
} from "@/lib/live/displayName";

/** One person's presence entry, as every connection on this channel tracks it. */
export interface PresenceEntry {
  participantId: string;
  displayName: string;
  /** Epoch milliseconds, from a server's clock rather than the phone's. */
  joinedAt: number;
}

/**
 * Reads one tracked entry, or null.
 *
 * **Why every field is checked and not just typed.** `presenceState<PresenceEntry>()` is a type
 * parameter and nothing more: Supabase does not validate a presence payload. Since #149 the
 * session's channel is private, so only a socket the server issued a token for this session can
 * join it at all — but a `realtime.messages` policy is evaluated when a socket joins, against a
 * row that carries the topic and the kind of message and nothing of what is later tracked
 * (checked against the local Realtime: the policy sees `payload` and `event` as null). So a
 * participant of the room can still `track()` whatever JSON they like, under any presence key,
 * and what they track is printed on the screen at the front of a classroom. A `displayName` that
 * is an object rather than a string would throw "Objects are not valid as a React child" and take
 * the host's console down for the whole room.
 *
 * The name is put through `cleanDisplayName` (#129) for the same reason it is on the way in: a
 * bidi override in a presence entry reorders the roster lines around it, and escaping does not
 * help with characters that are not markup. An entry that could not have come from
 * `join_session` — no name, or one past the cap that function truncates at — is not a
 * participant, and is dropped rather than shown.
 *
 * What this cannot stop is a participant of the room tracking an entry with an ordinary name —
 * their own, a made-up one, or a classmate's id — which is a property of Realtime presence rather
 * than of this function. It changes what the roster shows and reaches nothing else: no item, no
 * key, no answer, no row. Every one of those is keyed off the cookie-checked participant id, never
 * off presence. Someone who is not in the room can no longer do even this (#149).
 */
function personFrom(entry: PresenceEntry): Participant | null {
  if (typeof entry.participantId !== "string" || entry.participantId === "") return null;
  if (typeof entry.displayName !== "string") return null;
  if (typeof entry.joinedAt !== "number" || !Number.isFinite(entry.joinedAt)) return null;

  const displayName = cleanDisplayName(entry.displayName);
  if (displayName === "" || displayNameLength(displayName) > DISPLAY_NAME_MAX_LENGTH) return null;
  return { participantId: entry.participantId, displayName, joinedAt: entry.joinedAt };
}

/**
 * Folds a channel's presence state into a roster.
 *
 * `self` is folded in when it is not already there. Presence can lag a fraction behind a
 * successful `track`, and a screen that answered with an empty room containing everyone but you
 * reads as a failure to join rather than as a sync that has not landed yet. It is not put through
 * `personFrom`: it did not come off the socket, it came from the server that admitted this
 * connection to the room.
 */
export function rosterFrom(
  tracked: Record<string, PresenceEntry[]>,
  self: Participant | null = null,
): Participant[] {
  const people = new Map<string, Participant>();
  for (const entries of Object.values(tracked)) {
    for (const entry of entries) {
      const person = personFrom(entry);
      if (person !== null) people.set(person.participantId, person);
    }
  }
  if (self !== null && !people.has(self.participantId)) people.set(self.participantId, self);

  return [...people.values()].sort(
    (a, b) => a.joinedAt - b.joinedAt || a.participantId.localeCompare(b.participantId),
  );
}
