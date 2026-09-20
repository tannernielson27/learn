/**
 * A student's connection to the room, for a phone that has already joined (#132).
 *
 * ## Why this is not `createSupabaseParticipant`
 *
 * #131's participant transport is the full `LiveSessionTransport`: it joins by code, it fetches
 * the item from `POST /api/live/view` and it answers through `POST /api/live/submit`. Both of
 * those routes authenticate the caller through `LiveRouteDeps.verify`, and that seam is still
 * open — #129's join mints an httpOnly cookie token, #131's default verifier expects a signed
 * bearer token, and nothing yet converts one into the other. Closing it is #133's job, together
 * with the screen that actually shows and answers an item.
 *
 * This story needs neither of those routes. A lobby and a waiting screen need exactly two things,
 * and both come straight off the Realtime channel with the publishable key every browser already
 * holds:
 *
 *   * **Presence** — so the host's lobby fills in as phones arrive, and greys out as they sleep.
 *     Nothing tracks presence until a participant's page does; without this, a host's roster is
 *     empty however many students are in the room.
 *   * **State** — `postgres_changes` on `live.session_public_state`, whose row *is* the four facts
 *     a participant may know. `replica identity full` means the payload carries all four, so a
 *     move reaches a phone with no round trip of its own: one message, no fetch (ADR 0002's
 *     message budget, and the second a host has to advance the room in).
 *
 * The participant's identity is not asserted here. `participantId` and `displayName` are handed
 * down by the page, which got them from `resume_participant` against the cookie token; a browser
 * that made them up would put a name in a roster and could do nothing else at all, because
 * nothing on this connection reads, writes or scores anything.
 *
 * No item, no answer key and no rationale can travel over this connection (ADR 0003): the only
 * table it is subscribed to has four columns and none of them is an item.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SESSION_STATUSES,
  type LiveSessionState,
  type Participant,
  type SessionStatus,
} from "@/lib/live";
import type { Database } from "@/lib/supabase/database.types";
import { rosterFrom, type PresenceEntry } from "./presence";
import { LIVE_SCHEMA, liveTopic } from "./wire";

/**
 * What the phone can say about its own connection.
 *
 * "reconnecting" is not an error state: Realtime retries by itself, and this is what lets the
 * screen say so rather than silently showing a room that has moved on.
 */
export type RoomConnection = "connecting" | "live" | "reconnecting";

export interface ParticipantRoomOptions {
  /** The browser client, holding the publishable key. Used for its channel and nothing else. */
  client: SupabaseClient<Database>;
  sessionId: string;
  /** This phone's own presence entry, as the page's server render established it. */
  me: PresenceEntry;
  onState: (state: LiveSessionState) => void;
  onRoster: (roster: Participant[]) => void;
  /**
   * `rejoined` is true when the channel has come up *again*, which is the caller's cue to re-read
   * whatever it is holding: Realtime replays nothing, so every move made while the socket was
   * down was simply not delivered.
   */
  onConnection: (status: RoomConnection, rejoined: boolean) => void;
}

export interface ParticipantRoom {
  /** Drops the connection and takes this name out of the roster. Calling it twice is harmless. */
  leave(): Promise<void>;
}

const STATUSES = new Set<string>(SESSION_STATUSES);

/**
 * Reads a `live.session_public_state` row off the wire, or null.
 *
 * Checked rather than trusted, and null rather than thrown: this runs inside a socket listener on
 * a student's phone, where the only useful answer to a payload that is not a state row is to
 * ignore it and wait for the next move.
 */
export function publicStateFrom(row: unknown): LiveSessionState | null {
  if (typeof row !== "object" || row === null) return null;
  const {
    status,
    item_position: position,
    item_count: count,
    reveal,
  } = row as Record<string, unknown>;
  if (typeof status !== "string" || !STATUSES.has(status)) return null;
  if (position !== null && typeof position !== "number") return null;
  if (typeof count !== "number" || typeof reveal !== "boolean") return null;
  return {
    status: status as SessionStatus,
    position: position ?? null,
    itemCount: count,
    reveal,
  };
}

export function createParticipantRoom(options: ParticipantRoomOptions): ParticipantRoom {
  const { client, sessionId, me } = options;
  let gone = false;
  let subscribed = false;

  const channel = client.channel(liveTopic(sessionId), {
    config: { presence: { key: me.participantId } },
  });

  channel.on(
    "postgres_changes",
    {
      event: "*",
      // Not `public`: the mirror lives in a schema the Data API does not expose, so a table
      // `anon` has to be able to read is not a table `anon` can list. See #131's migration.
      schema: LIVE_SCHEMA,
      table: "session_public_state",
      filter: `session_id=eq.${sessionId}`,
    },
    (message: { new: unknown }) => {
      if (gone) return;
      const state = publicStateFrom(message.new);
      if (state !== null) options.onState(state);
    },
  );

  channel.on("presence", { event: "sync" }, () => {
    if (gone) return;
    options.onRoster(rosterFrom(channel.presenceState<PresenceEntry>(), me));
  });

  channel.subscribe((status) => {
    if (gone) return;
    if (status === "SUBSCRIBED") {
      // Tracked on every subscribe, not only the first. A rejoined channel carries none of the
      // presence the old one held, so a phone that does not track again has quietly left the room
      // as far as the front of the class is concerned.
      void channel.track(me).catch(() => {});
      options.onConnection("live", subscribed);
      subscribed = true;
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      options.onConnection("reconnecting", false);
    }
  });

  return {
    async leave(): Promise<void> {
      if (gone) return;
      gone = true;
      // A socket that is already down cannot be told this name is going; the server drops the
      // presence entry with the connection anyway. Swallowed so that the channel is still removed
      // and so that a component's cleanup — which cannot await — has nothing to reject.
      try {
        await channel.untrack();
      } catch {
        // Nothing to do: the entry goes with the connection.
      }
      await client.removeChannel(channel);
    },
  };
}
