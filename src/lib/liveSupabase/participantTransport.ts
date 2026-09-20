/**
 * The participant half of the Supabase adapter: a `LiveSessionTransport` over Realtime and two
 * route handlers (#131, ADR 0002).
 *
 * A student is not signed in, so this connection has no Postgres identity at all. What it can do
 * is therefore small on purpose:
 *
 *   * **State** arrives as `postgres_changes` on `public.session_public_state`, a four-column
 *     mirror of the session that holds no org, no host, no code and no item ids. The session row
 *     itself stays unreadable to `anon`, as #128 left it.
 *   * **The roster** is Realtime Presence on the session's channel: names, and nothing else.
 *   * **The item, and the key at reveal** come from `POST /api/live/view`, because only a server
 *     may read `public.items`. What comes back is a `ParticipantItem` — branded so that an item
 *     still carrying an `answerKey` would not type-check (#130) — and a `revealed` block that is
 *     null until the host has revealed (ADR 0003).
 *   * **Answers** go to `POST /api/live/submit`, which scores them server-side and answers with an
 *     acknowledgement carrying no marks.
 *
 * Joining is #129's: `join` is injected. See `wire.ts` for the whole of that contract.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIVE_REFUSALS,
  LiveSessionError,
  type ItemReveal,
  type LiveRefusal,
  type LiveSessionTransport,
  type Participant,
  type ParticipantIdentity,
  type ParticipantItem,
  type ParticipantSnapshot,
  type SessionView,
  type Unsubscribe,
} from "@/lib/live";
import { isSessionCode, normalizeSessionCode } from "@/lib/live/sessionCode";
import type { Database } from "@/lib/supabase/database.types";
import {
  LIVE_ROUTES,
  liveTopic,
  type JoinSession,
  type ParticipantCredentials,
  type ParticipantViewPayload,
  type RefusalPayload,
  type SubmitAckPayload,
} from "./wire";

const DISPLAY_NAME_MAX = 60;

/** One person's presence entry. Names only: a roster is not a list of who answered what. */
export interface PresenceEntry {
  participantId: string;
  displayName: string;
  joinedAt: number;
}

export interface ParticipantTransportOptions {
  /** The browser client, holding the publishable key. Used for its channel and nothing else. */
  client: SupabaseClient<Database>;
  /** #129's join path. */
  join: JoinSession;
  /** Injectable so the conformance suite can drive the real route handlers without a server. */
  fetch?: typeof globalThis.fetch;
  /** Prefixed onto the route paths. Empty in a browser, where they are same-origin. */
  baseUrl?: string;
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
): LiveSessionTransport {
  const call = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl ?? "";

  const views = new Set<(view: SessionView<ParticipantItem>) => void>();
  const presence = new Set<(roster: Participant[]) => void>();
  const reveals = new Set<(revealed: ItemReveal) => void>();

  let credentials: ParticipantCredentials | null = null;
  let channel: ReturnType<SupabaseClient<Database>["channel"]> | null = null;
  let gone = false;
  /** So a reveal that stays true across several state messages is announced once. */
  let announcedReveal: number | null = null;

  function rosterNow(): Participant[] {
    const tracked = channel?.presenceState<PresenceEntry>() ?? {};
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
    // Presence can lag a fraction behind a successful `track`, and `join` has to answer with a
    // roster this person is already in — an empty room with yourself missing from it reads as a
    // failure to join.
    if (credentials !== null && !people.has(credentials.participantId)) {
      people.set(credentials.participantId, {
        participantId: credentials.participantId,
        displayName: credentials.displayName,
        joinedAt: credentials.joinedAt,
      });
    }
    return [...people.values()].sort(
      (a, b) => a.joinedAt - b.joinedAt || a.participantId.localeCompare(b.participantId),
    );
  }

  async function requestView(): Promise<ParticipantViewPayload> {
    if (credentials === null) throw new LiveSessionError("not_joined");
    const response = await call(`${base}${LIVE_ROUTES.view}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${credentials.token}`,
      },
      body: "{}",
    });
    if (!response.ok) throw await asError(response);
    return (await response.json()) as ParticipantViewPayload;
  }

  /** Re-reads the view and tells whoever is listening. One fetch per state change, not per field. */
  async function refresh(): Promise<void> {
    if (gone || credentials === null) return;
    const payload = await requestView();
    if (gone) return;
    const view: SessionView<ParticipantItem> = { state: payload.state, item: payload.item };
    for (const listener of views) listener(view);

    if (payload.revealed === null) {
      announcedReveal = null;
      return;
    }
    if (announcedReveal === payload.revealed.position) return;
    announcedReveal = payload.revealed.position;
    for (const listener of reveals) listener(payload.revealed);
  }

  function openChannel(sessionId: string, entry: PresenceEntry): Promise<void> {
    const opened = options.client.channel(liveTopic(sessionId), {
      config: { presence: { key: entry.participantId } },
    });
    channel = opened;
    opened.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "session_public_state",
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        void refresh();
      },
    );
    opened.on("presence", { event: "sync" }, () => {
      const roster = rosterNow();
      for (const listener of presence) listener(roster);
    });

    return new Promise<void>((resolve) => {
      opened.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void opened.track(entry).then(() => resolve());
      });
    });
  }

  function snapshot(view: ParticipantViewPayload): ParticipantSnapshot {
    const held = credentials as ParticipantCredentials;
    return {
      sessionId: held.sessionId,
      code: held.code,
      mode: held.mode,
      participantId: held.participantId,
      roster: rosterNow(),
      state: view.state,
      item: view.item,
    };
  }

  return {
    async join(typedCode, identity): Promise<ParticipantSnapshot> {
      // Joining twice is the same join: an effect that re-runs must not put a second name in the
      // room. The name given the first time is the one the class sees.
      if (credentials !== null) return snapshot(await requestView());

      const displayName = readName(identity);
      const code = normalizeSessionCode(typedCode);
      // Something that could never be a code is answered here rather than over the network, the
      // same way `resolveSessionCode` does it (#128): it costs a round trip to be told what the
      // alphabet already says, and a malformed code cannot match a row.
      if (!isSessionCode(code)) throw new LiveSessionError("unknown_code");

      credentials = await options.join(code, { ...identity, displayName });
      gone = false;
      announcedReveal = null;
      await openChannel(credentials.sessionId, {
        participantId: credentials.participantId,
        displayName: credentials.displayName,
        joinedAt: credentials.joinedAt,
      });
      const view = await requestView();
      announcedReveal = view.revealed?.position ?? null;
      return snapshot(view);
    },

    async leave(): Promise<void> {
      gone = true;
      views.clear();
      presence.clear();
      reveals.clear();
      const open = channel;
      channel = null;
      credentials = null;
      if (open === null) return;
      await open.untrack();
      await options.client.removeChannel(open);
    },

    onSessionState: (listener) => subscribe(views, listener),
    onPresence: (listener) => subscribe(presence, listener),
    onReveal: (listener) => subscribe(reveals, listener),

    async submit(itemId, response) {
      if (credentials === null) throw new LiveSessionError("not_joined");
      const sent = await call(`${base}${LIVE_ROUTES.submit}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${credentials.token}`,
        },
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
