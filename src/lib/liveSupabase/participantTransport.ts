/**
 * The participant half of the Supabase adapter: a `LiveSessionTransport` over Realtime and two
 * route handlers (#131, ADR 0002), and — since #133 — the one connection a student's phone has.
 *
 * A student is not signed in, so this connection has no Postgres identity at all. What it can do
 * is therefore small on purpose:
 *
 *   * **State** arrives as `postgres_changes` on `live.session_public_state`, a four-column
 *     mirror of the session that holds no org, no host, no code and no item ids. The session row
 *     itself stays unreadable to `anon`, as #128 left it. The table is `replica identity full`,
 *     so the whole row is in the message and a pause or a resume costs no request of its own.
 *   * **The roster** is Realtime Presence on the session's channel: names, and nothing else.
 *   * **The item, this phone's own answer, and the key at reveal** come from
 *     `POST /api/live/view`, because only a server may read `public.items`. What comes back is a
 *     `ParticipantItem` — branded so that an item still carrying an `answerKey` would not
 *     type-check (#130) — and a `revealed` block that is null until the host has revealed
 *     (ADR 0003).
 *   * **Answers** go to `POST /api/live/submit`, which scores them server-side and answers with
 *     an acknowledgement carrying no marks.
 *
 * ## Two entries, because a phone arrives two ways (#133)
 *
 * `join(code, identity)` is the first one: a typed or scanned code becomes a participant. But the
 * page a student actually lives on is reached by reload, by reconnect and by
 * `router.refresh()`, and none of those has a code — `resume_participant` deliberately does not
 * return one. `resume(identity)` is that entry: the page has already turned the httpOnly cookie
 * into a participant on the server, and hands down who they are.
 *
 * This is also why #132's `participantRoom.ts` is gone. It existed because the token seam was
 * open and the lobby needed presence and state without being able to answer anything. Closing the
 * seam removed the reason, and keeping it would have meant a phone showing an item held two
 * channels on the same topic: one to hear the room move, one to answer it.
 *
 * Nothing on this connection is a credential. The cookie is httpOnly and the browser attaches it
 * to these same-origin requests by itself; script on the page cannot read it, and nothing here
 * holds it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
// Module by module rather than through `@/lib/live`: that barrel value-exports the in-memory
// adapter, which holds items with their keys and imports the scoring engine. This file is what a
// student's phone loads (ADR 0003, `noClientScoring.test.ts`), so it takes only what it uses.
import { LIVE_REFUSALS, LiveSessionError, type LiveRefusal } from "@/lib/live/errors";
import { isSessionCode, normalizeSessionCode } from "@/lib/live/sessionCode";
import { SESSION_STATUSES, type LiveSessionState, type SessionStatus } from "@/lib/live/state";
import type {
  ItemReveal,
  LiveSessionTransport,
  Participant,
  ParticipantIdentity,
  ParticipantItem,
  ParticipantSnapshot,
  SessionView,
  Unsubscribe,
} from "@/lib/live/transport";
import { rosterFrom, type PresenceEntry } from "./presence";
import type { Database } from "@/lib/supabase/database.types";
import {
  LIVE_ROUTES,
  LIVE_SCHEMA,
  liveTopic,
  presentRealtimeToken,
  type AnsweredPayload,
  type JoinSession,
  type ParticipantCredentials,
  type ParticipantViewPayload,
  type RefusalPayload,
  type SubmitAckPayload,
} from "./wire";

const DISPLAY_NAME_MAX = 60;

/**
 * What the phone can say about its own connection.
 *
 * "reconnecting" is not an error state: Realtime retries by itself, and this is what lets the
 * screen say so rather than silently showing a room that has moved on.
 */
export type RoomConnection = "connecting" | "live" | "reconnecting";

/** Who this phone is, as the page's server render established it. Never asserted by the browser. */
export interface ResumedIdentity {
  sessionId: string;
  participantId: string;
  /** The name the database holds, never the one in the cookie. */
  displayName: string;
  /** Epoch milliseconds from the server's clock, so the roster has an order. */
  joinedAt: number;
}

/**
 * Everything a student's screen is on: the room's state and item, plus the two things only this
 * student may know — what they themselves answered, and, once the host has revealed, the key and
 * their own marks.
 *
 * It is not on `LiveSessionTransport`, and deliberately so. That interface is what *any* adapter
 * owes any participant screen, and `SessionView` there is the pair every one of them has. These
 * two extras are this screen's, delivered through `onStudentView` beside the plain
 * `onSessionState` the conformance suite drives.
 */
export interface StudentView extends SessionView<ParticipantItem> {
  answered: AnsweredPayload | null;
  revealed: ItemReveal | null;
}

/**
 * The participant connection this adapter returns: a `LiveSessionTransport`, plus the three
 * things only a real socket to a real room can offer.
 */
export interface SupabaseParticipant extends LiveSessionTransport {
  /** Opens the room for a phone that is already in it. See "Two entries" above. */
  resume(identity: ResumedIdentity): Promise<StudentView>;
  /** The view a student's screen renders, including their own answer and the reveal. */
  onStudentView(listener: (view: StudentView) => void): Unsubscribe;
  /**
   * Whether the socket is up. `rejoined` is true when the channel has come up *again*, which is
   * the caller's cue to re-read whatever it is holding: Realtime replays nothing, so every move
   * made while the socket was down was simply not delivered.
   */
  onConnection(listener: (status: RoomConnection, rejoined: boolean) => void): Unsubscribe;
}

export interface ParticipantTransportOptions {
  /**
   * The browser client, holding the publishable key and — since #149 — an `accessToken` callback
   * that answers with this participant's channel token. Used for its channel and nothing else.
   */
  client: SupabaseClient<Database>;
  /** #129's join path. Only `join` needs it; a resumed phone has already been through it. */
  join?: JoinSession;
  /** Injectable so the conformance suite can drive the real route handlers without a server. */
  fetch?: typeof globalThis.fetch;
  /** Prefixed onto the route paths. Empty in a browser, where they are same-origin. */
  baseUrl?: string;
}

const STATUSES = new Set<string>(SESSION_STATUSES);

/**
 * Reads a `live.session_public_state` row off the wire, or null.
 *
 * Checked rather than trusted, and null rather than thrown: this runs inside a socket listener on
 * a student's phone, where the only useful answer to a payload that is not a state row is to
 * ignore it and ask the server instead.
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

/** Adds a listener to a set and hands back the unsubscribe. Calling it twice is harmless. */
function subscribe<T>(listeners: Set<T>, listener: T): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readName(identity: ParticipantIdentity): string {
  const displayName = identity.displayName.trim();
  if (displayName === "") throw new LiveSessionError("no_name");
  if (displayName.length > DISPLAY_NAME_MAX) throw new LiveSessionError("name_too_long");
  return displayName;
}

export function createSupabaseParticipant(
  options: ParticipantTransportOptions,
): SupabaseParticipant {
  const call = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl ?? "";

  const views = new Set<(view: SessionView<ParticipantItem>) => void>();
  const students = new Set<(view: StudentView) => void>();
  const presence = new Set<(roster: Participant[]) => void>();
  const reveals = new Set<(revealed: ItemReveal) => void>();
  const connections = new Set<(status: RoomConnection, rejoined: boolean) => void>();

  /** Who this connection is. Set by `join` or by `resume`, and by nothing else. */
  let me: ResumedIdentity | null = null;
  /** Only `join` produces these; only a `ParticipantSnapshot` needs the code and the mode. */
  let credentials: ParticipantCredentials | null = null;
  let channel: ReturnType<SupabaseClient<Database>["channel"]> | null = null;
  /**
   * Which entry this connection is on. `leave` bumps it, so an entry that was still in flight
   * when a component unmounted can tell that it is finishing into a room nobody is in any more.
   * Without it the awaited `options.join(...)` comes back and quietly undoes the `leave`, putting
   * a name back in the roster and leaving a channel open for the rest of the session — and
   * `leave` is documented in `transport.ts` as safe to call from a cleanup without checking,
   * which is exactly what this makes true.
   */
  let generation = 0;
  let gone = false;
  /** So a reveal that stays true across several state messages is announced once. */
  let announcedReveal: number | null = null;
  /** The last view fetched, so a state message that needs no fetch can be answered from it. */
  let held: ParticipantViewPayload | null = null;

  function rosterNow(): Participant[] {
    // An entry has to answer with a roster this person is already in, so this connection's own
    // entry is folded in when a sync has not carried it back yet. See `rosterFrom`.
    const self =
      me === null
        ? null
        : { participantId: me.participantId, displayName: me.displayName, joinedAt: me.joinedAt };
    return rosterFrom(channel?.presenceState<PresenceEntry>() ?? {}, self);
  }

  async function requestView(): Promise<ParticipantViewPayload> {
    if (me === null) throw new LiveSessionError("not_joined");
    const response = await call(`${base}${LIVE_ROUTES.view}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The participant cookie is httpOnly, so the browser is what attaches it. Said explicitly
      // rather than left to the default, because it is the whole of this request's authority.
      credentials: "same-origin",
      body: "{}",
    });
    if (!response.ok) throw await asError(response);
    return (await response.json()) as ParticipantViewPayload;
  }

  function announce(payload: ParticipantViewPayload): void {
    held = payload;
    const view: SessionView<ParticipantItem> = { state: payload.state, item: payload.item };
    // Copied before dispatch: a listener may call `leave`, which clears these sets, and mutating
    // a Set mid-iteration silently drops whoever had not been reached yet.
    for (const listener of [...views]) listener(view);
    for (const listener of [...students]) {
      listener({ ...view, answered: payload.answered, revealed: payload.revealed });
    }

    if (payload.revealed === null) {
      announcedReveal = null;
      return;
    }
    if (announcedReveal === payload.revealed.position) return;
    announcedReveal = payload.revealed.position;
    for (const listener of [...reveals]) listener(payload.revealed);
  }

  /** Re-reads the view and tells whoever is listening. One fetch per state change, not per field. */
  async function refresh(): Promise<void> {
    const mine = generation;
    if (gone || me === null) return;
    const payload = await requestView();
    if (gone || mine !== generation) return;
    announce(payload);
  }

  /**
   * What a state message means, and whether it costs a request.
   *
   * `replica identity full` puts the whole `session_public_state` row in the message, so a pause,
   * a resume and an end are already here in full and can be shown with no round trip at all — the
   * item on the screen has not changed, only what the room is doing with it. A new position or a
   * flipped reveal are different: the first is a different item and the second is a key, and both
   * live behind `/api/live/view`, where the server decides what this phone may hold (ADR 0003).
   *
   * A payload that is not a state row falls through to a fetch rather than being ignored: it is
   * the room telling this phone that *something* moved, and asking is always safe.
   */
  function onStateMessage(row: unknown): void {
    const next = publicStateFrom(row);
    const standing = held;
    if (
      next !== null &&
      standing !== null &&
      next.position === standing.state.position &&
      next.reveal === standing.state.reveal
    ) {
      announce({ ...standing, state: next });
      return;
    }
    // A listener cannot await, and a failed refresh must not become an unhandled rejection in a
    // student's browser. Nothing is retried here on purpose: the next state change asks again,
    // and a session that has gone away has no move to report.
    void refresh().catch(() => {});
  }

  function notifyConnection(status: RoomConnection, rejoined: boolean): void {
    for (const listener of [...connections]) listener(status, rejoined);
  }

  async function openChannel(sessionId: string, entry: PresenceEntry): Promise<void> {
    await presentRealtimeToken(options.client);
    // A `leave` that landed while the token was being fetched: opening now would leave a channel
    // behind that nobody will ever remove.
    if (gone) throw new LiveSessionError("not_joined");
    const opened = options.client.channel(liveTopic(sessionId), {
      // Private (#149): Realtime checks this socket's token against the `realtime.messages`
      // policies before it lets it in, so only a phone the server vouched for — for this session
      // and no other — hears the roster or can put a name in it. The token is the client's
      // `accessToken`; see `channelTokenSource.ts`.
      config: { private: true, presence: { key: entry.participantId } },
    });
    channel = opened;
    opened.on(
      "postgres_changes",
      {
        event: "*",
        // Not `public`: the mirror lives in a schema the Data API does not expose, so a table
        // `anon` has to be able to read is not a table `anon` can list. See the migration.
        schema: LIVE_SCHEMA,
        table: "session_public_state",
        filter: `session_id=eq.${sessionId}`,
      },
      (message: { new: unknown }) => {
        if (gone) return;
        onStateMessage(message.new);
      },
    );
    opened.on("presence", { event: "sync" }, () => {
      if (gone) return;
      const roster = rosterNow();
      for (const listener of [...presence]) listener(roster);
    });

    /**
     * Settles when the channel first comes up, or when it first fails to.
     *
     * The flag matters more than it looks. `subscribe` is called again on every reconnect for the
     * life of the channel, and what a `SUBSCRIBED` means depends entirely on whether the entry
     * that is awaiting this promise has already been answered. If it has — because this is an
     * ordinary rejoin, **or because the first attempt failed before anything read the room** —
     * then Realtime has replayed nothing and nobody has fetched the item, so the only useful
     * thing to do is ask again. Keying that off "have we ever subscribed before" instead left a
     * phone whose socket came up late sitting on the server's first paint for the rest of the
     * class, with a banner that said it had reconnected.
     */
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const answerEntry = (error?: Error) => {
        if (settled) return false;
        settled = true;
        if (error) reject(error);
        else resolve();
        return true;
      };

      opened.subscribe((status) => {
        if (gone) return;
        if (status === "SUBSCRIBED") {
          const opening = !settled;
          // `then(..., reject)`, not `.then(...)`: a `track` that rejects — the socket dropping in
          // the moment after it subscribed — would otherwise leave this promise, and the entry
          // awaiting it, pending for ever.
          void opened.track(entry).then(() => {
            notifyConnection("live", !opening);
            // A rejoined channel carries none of the presence the old one held either, which is
            // why `track` above runs on every subscribe and not only the first.
            if (!answerEntry()) void refresh().catch(() => {});
          }, answerEntry);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          notifyConnection("reconnecting", false);
          // Harmless once the promise has settled, which is the ordinary case for CLOSED.
          answerEntry(new Error(`The session's channel could not be opened (${status}).`));
        }
      });
    });
  }

  /** Opens the channel for `identity` and reads the room once. Both entries end here. */
  async function enter(mine: number, identity: ResumedIdentity): Promise<StudentView> {
    me = identity;
    gone = false;
    announcedReveal = null;
    held = null;
    notifyConnection("connecting", false);
    await openChannel(identity.sessionId, {
      participantId: identity.participantId,
      displayName: identity.displayName,
      joinedAt: identity.joinedAt,
    });
    if (mine !== generation) throw new LiveSessionError("not_joined");
    const view = await requestView();
    if (mine !== generation) throw new LiveSessionError("not_joined");
    announce(view);
    return studentView(view);
  }

  const studentView = (payload: ParticipantViewPayload): StudentView => ({
    state: payload.state,
    item: payload.item,
    answered: payload.answered,
    revealed: payload.revealed,
  });

  function snapshot(joined: ParticipantCredentials, view: StudentView): ParticipantSnapshot {
    return {
      sessionId: joined.sessionId,
      code: joined.code,
      mode: joined.mode,
      participantId: joined.participantId,
      roster: rosterNow(),
      state: view.state,
      item: view.item,
    };
  }

  return {
    async join(typedCode, identity): Promise<ParticipantSnapshot> {
      if (options.join === undefined) throw new LiveSessionError("not_joined");
      // Joining twice is the same join: an effect that re-runs must not put a second name in the
      // room. The name given the first time is the one the class sees.
      const already = credentials;
      if (already !== null) return snapshot(already, studentView(await requestView()));

      const displayName = readName(identity);
      const code = normalizeSessionCode(typedCode);
      // Something that could never be a code is answered here rather than over the network, the
      // same way `resolveSessionCode` does it (#128): it costs a round trip to be told what the
      // alphabet already says, and a malformed code cannot match a row.
      if (!isSessionCode(code)) throw new LiveSessionError("unknown_code");

      const mine = generation;
      const joined = await options.join(code, { ...identity, displayName });
      // Someone called `leave` while the join was in flight. Finishing now would put a name back
      // in a room the caller has left, and leave a channel open behind it.
      if (mine !== generation) throw new LiveSessionError("not_joined");

      credentials = joined;
      const view = await enter(mine, {
        sessionId: joined.sessionId,
        participantId: joined.participantId,
        displayName: joined.displayName,
        joinedAt: joined.joinedAt,
      });
      return snapshot(joined, view);
    },

    async resume(identity): Promise<StudentView> {
      // Resuming twice is the same resume, for the same reason joining twice is: an effect that
      // re-runs must not open a second channel on the same topic.
      if (me !== null) {
        const mine = generation;
        const payload = await requestView();
        // The same guard every other awaiting path here keeps: a `leave` that landed while this
        // was in flight means there is nobody to tell, and nothing to hold on to.
        if (gone || mine !== generation) throw new LiveSessionError("not_joined");
        announce(payload);
        return studentView(payload);
      }
      return enter(generation, identity);
    },

    async leave(): Promise<void> {
      generation += 1;
      gone = true;
      views.clear();
      students.clear();
      presence.clear();
      reveals.clear();
      connections.clear();
      const open = channel;
      channel = null;
      credentials = null;
      me = null;
      held = null;
      if (open === null) return;
      // A socket that is already down cannot be told this name is going; the server drops the
      // presence entry with the connection anyway. Swallowed so that the channel is still removed
      // and so that a component's cleanup — which cannot await — has nothing to reject.
      try {
        await open.untrack();
      } catch {
        // Nothing to do: the entry goes with the connection.
      }
      await options.client.removeChannel(open);
    },

    onSessionState: (listener) => subscribe(views, listener),
    onStudentView: (listener) => subscribe(students, listener),
    onPresence: (listener) => subscribe(presence, listener),
    onReveal: (listener) => subscribe(reveals, listener),
    onConnection: (listener) => subscribe(connections, listener),

    async submit(itemId, response) {
      if (me === null) throw new LiveSessionError("not_joined");
      const sent = await call(`${base}${LIVE_ROUTES.submit}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ itemId, response }),
      });
      if (!sent.ok) throw await asError(sent);
      const ack = (await sent.json()) as SubmitAckPayload;
      return { itemId: ack.itemId, submittedAt: ack.submittedAt };
    },
  };
}

/**
 * Turns a refused response back into the refusal the rest of the app speaks. A body without a
 * recognised code is a fault, not a refusal, and is thrown as an ordinary error so it shows up as
 * one rather than as a sentence in a student's face.
 */
async function asError(response: Response): Promise<Error> {
  let body: Partial<RefusalPayload> | null = null;
  try {
    body = (await response.json()) as Partial<RefusalPayload>;
  } catch {
    body = null;
  }
  const refusal = body?.refusal;
  if (typeof refusal === "string" && refusal in LIVE_REFUSALS) {
    return new LiveSessionError(refusal as LiveRefusal);
  }
  return new Error(`The session refused that request (${response.status}).`);
}
