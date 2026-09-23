/**
 * A whole live session standing on the fake stack: seeded rows, the two real route handlers behind
 * a `fetch`, a stand-in for #129's join *action*, and the real participant and host transports.
 *
 * This is what `describeRoomConformance` is handed, so the suite that drives the in-memory adapter
 * drives this one unchanged.
 *
 * **What is real here.** Since #133, the thing that says who is speaking is real: `deps.verify` is
 * `participantFromCookie`, the same verifier `liveRouteDeps()` builds in production, reading the
 * same cookie and calling the same `resume_participant`. The stand-in is only the *action* around
 * it — resolving a typed code and writing the cookie into this browser's jar — because that is a
 * Server Function in `src/app/join/actions.ts` and not something this folder owns.
 *
 * **Why each participant has a cookie jar.** The transport no longer presents a credential of any
 * kind: the participant cookie is httpOnly, so in a browser it is the browser that attaches it.
 * The jar below is that browser, and nothing else models it — a shared `fetch` would let one
 * student answer as another, which is exactly the property the payload and refusal tests lean on.
 */
import {
  LiveSessionError,
  pacedState,
  type LiveSessionState,
  type LiveSessionTransport,
  type SessionMode,
} from "@/lib/live";
import {
  PARTICIPANT_COOKIE,
  formatParticipantToken,
  type ParticipantToken,
} from "@/lib/live/participantToken";
import { normalizeSessionCode } from "@/lib/live/sessionCode";
import type { ConformanceRoom, ConformanceRoomOptions } from "@/lib/live/roomConformance";
import type { Item } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { issueChannelToken } from "../channelRoute";
import { createChannelTokenSource } from "../channelTokenSource";
import { createSupabaseHost } from "../hostTransport";
import {
  createSupabaseParticipant,
  type ResumedIdentity,
  type SupabaseParticipant,
} from "../participantTransport";
import { participantFromCookie, type LiveRouteDeps } from "../routeDeps";
import { submitSessionResponse } from "../submitRoute";
import { readParticipantView } from "../viewRoute";
import { LIVE_ROUTES, type JoinSession, type ParticipantCredentials } from "../wire";
import {
  FAKE_JWT_SECRET,
  FakeSupabase,
  createFakeClient,
  type FakeSessionRow,
} from "./fakeSupabase";

const ORG_ID = "00000000-0000-0000-0000-0000000131aa";
const HOST_ID = "00000000-0000-0000-0000-0000000131bb";
const ORIGIN = "http://live.test";

/** One browser's cookie store, holding the one cookie a participant ever has. */
interface CookieJar {
  token: ParticipantToken | null;
}

export interface FakeRoom extends ConformanceRoom {
  readonly stack: FakeSupabase;
  readonly orgId: string;
  /**
   * A participant whose join path is wrapped, for the races a conformance test cannot pose:
   * `wrap` is handed the real stand-in and returns the one this connection should use.
   */
  participantWith(wrap: (join: JoinSession) => JoinSession): LiveSessionTransport;
  /**
   * A phone that is already in the room — a reload, a reconnect, a `router.refresh()`. It has the
   * cookie the join left behind and no code at all, which is the case `resume` exists for.
   */
  resuming(id: string): SupabaseParticipant;
  /** Who a participant is, as their page's server render would have established it. */
  identityOf(id: string): ResumedIdentity;
}

/** A row id for `public.items`, which is a uuid and is never the id the item calls itself. */
function rowId(index: number): string {
  return `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`;
}

export function createFakeRoom(options: ConformanceRoomOptions): FakeRoom {
  const stack = new FakeSupabase();
  const items: readonly Item[] = options.items;

  items.forEach((item, index) => {
    stack.items.push({ id: rowId(index), org_id: ORG_ID, status: "published", ...toItemRow(item) });
  });

  const session: FakeSessionRow = {
    id: options.sessionId,
    org_id: ORG_ID,
    host_id: HOST_ID,
    code: normalizeSessionCode(options.code),
    title: "Conformance room",
    mode: options.mode ?? "instructor_paced",
    status: "lobby",
    item_set: items.map((_, index) => rowId(index)),
    current_position: null,
    reveal: false,
    timer_seconds: null,
    item_ends_at: null,
    timer_remaining_ms: null,
    closed_at: null,
  };
  stack.sessions.push(session);
  // What `sessions_mirror_public_state` writes on INSERT. Nobody is subscribed yet, so no message.
  stack.publicState.push({
    session_id: session.id,
    status: session.status,
    item_position: null,
    item_count: session.item_set.length,
    reveal: false,
    item_ends_at: null,
    timer_seconds: null,
    timer_remaining_ms: null,
    updated_at: stack.now(),
  });

  const service = createFakeClient(stack, { role: "service" });
  const deps: LiveRouteDeps = { verify: participantFromCookie(service), service };
  // The channel route signs with the key this stack's Realtime trusts, as production's signs with
  // the project's (#149).
  const channelDeps = {
    ...deps,
    signingKey: () => ({ alg: "HS256" as const, secret: FAKE_JWT_SECRET }),
  };

  /** The three real route handlers, behind a real `Request` and a real `Response`. */
  const call = async (path: string, init: RequestInit, jar: CookieJar): Promise<Response> => {
    stack.touch();
    const headers = new Headers(init.headers);
    // The browser attaching an httpOnly cookie to a same-origin request. Nothing in the transport
    // put it here, and nothing in the transport could: it cannot read it.
    if (jar.token !== null) {
      headers.set("cookie", `${PARTICIPANT_COOKIE}=${formatParticipantToken(jar.token)}`);
    }
    const request = new Request(`${ORIGIN}${path}`, { ...init, headers });
    const response =
      path === LIVE_ROUTES.view
        ? await readParticipantView(request, deps)
        : path === LIVE_ROUTES.submit
          ? await submitSessionResponse(request, deps)
          : path === LIVE_ROUTES.channel
            ? await issueChannelToken(request, channelDeps)
            : new Response("not found", { status: 404 });
    // Everything the participant's process is handed, as bytes, for the payload test to read.
    stack.record({ kind: "http", label: `POST ${path}`, body: await response.clone().text() });
    return response;
  };

  const fetchFor =
    (jar: CookieJar): typeof globalThis.fetch =>
    async (input, init) =>
      call(new URL(String(input)).pathname, init ?? {}, jar);

  /**
   * The stand-in for `joinLiveSession`: resolve the code, call `join_session`, and put the cookie
   * in this browser's jar. Everything it calls is real; the Server Function around it is not.
   */
  const joinInto =
    (jar: CookieJar): JoinSession =>
    async (code, identity): Promise<ParticipantCredentials> => {
      const typed = normalizeSessionCode(code);
      const match = stack.sessions.find((row) => row.code === typed);
      if (!match) throw new LiveSessionError("unknown_code");
      if (match.status === "ended") throw new LiveSessionError("not_open");

      const { data, error } = await service.rpc("join_session", {
        target_session: match.id,
        chosen_name: identity.displayName,
      });
      const row = data?.[0];
      if (error || !row) throw new LiveSessionError("not_open");
      jar.token = {
        sessionId: match.id,
        participantId: row.participant_id,
        secret: row.rejoin_secret,
      };
      const held = stack.participants.find((person) => person.id === row.participant_id);
      return {
        sessionId: match.id,
        participantId: row.participant_id,
        code: match.code,
        mode: match.mode,
        displayName: held?.display_name ?? identity.displayName,
        joinedAt: Date.parse(held?.joined_at ?? ""),
      };
    };

  /**
   * A student's Realtime client, as `StudentRoom` builds it (#149): anonymous, with the channel
   * token as its `accessToken`. The source starts with nothing, so the first token comes from the
   * real `POST /api/live/channel` with this browser's cookie — the cookie is checked, then the
   * token is minted, exactly the order production keeps.
   */
  const studentConnection = (jar: CookieJar) => {
    const tokens = createChannelTokenSource({
      initial: { token: "", expiresAt: 0 },
      fetch: fetchFor(jar),
      baseUrl: ORIGIN,
    });
    return {
      client: createFakeClient(stack, { role: "anon", accessToken: tokens.accessToken }),
      tokens,
    };
  };

  const participantWith = (wrap: (join: JoinSession) => JoinSession): SupabaseParticipant => {
    const jar: CookieJar = { token: null };
    return createSupabaseParticipant({
      ...studentConnection(jar),
      join: wrap(joinInto(jar)),
      fetch: fetchFor(jar),
      baseUrl: ORIGIN,
    });
  };

  const identityOf = (id: string): ResumedIdentity => {
    const held = stack.participants.find((person) => person.id === id);
    if (!held) throw new Error(`no participant ${id} in this room`);
    return {
      sessionId: held.session_id,
      participantId: held.id,
      displayName: held.display_name,
      joinedAt: Date.parse(held.joined_at),
    };
  };

  return {
    stack,
    orgId: ORG_ID,
    participantWith,
    identityOf,

    /** The same browser, opening the page again: the cookie is still in the jar, the code is not. */
    resuming(id: string): SupabaseParticipant {
      const held = stack.participants.find((person) => person.id === id);
      if (!held) throw new Error(`no participant ${id} in this room`);
      const jar: CookieJar = {
        token: { sessionId: held.session_id, participantId: held.id, secret: held.rejoin_secret },
      };
      return createSupabaseParticipant({
        ...studentConnection(jar),
        fetch: fetchFor(jar),
        baseUrl: ORIGIN,
      });
    },

    sessionId: session.id,
    code: session.code,
    mode: session.mode as SessionMode,

    async currentState(): Promise<LiveSessionState> {
      const held = stack.sessions.find((row) => row.id === session.id) as FakeSessionRow;
      return pacedState(
        {
          status: held.status,
          position: held.current_position,
          itemCount: held.item_set.length,
          reveal: held.reveal,
          timer: {
            seconds: held.timer_seconds,
            endsAt: held.item_ends_at === null ? null : Date.parse(held.item_ends_at),
            remainingMs: held.timer_remaining_ms,
          },
        },
        held.mode,
      );
    },

    participant: () => participantWith((join) => join),

    host: () =>
      createSupabaseHost({
        client: createFakeClient(stack, { role: "authenticated", orgId: ORG_ID }),
        sessionId: session.id,
      }),

    settle: () => stack.settle(),
    tick: (ms) => stack.advance(ms),
    clock: () => stack.peek(),
    dispose: async () => {
      await stack.settle();
    },
  };
}
