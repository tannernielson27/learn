/**
 * A whole live session standing on the fake stack: seeded rows, the two real route handlers behind
 * a `fetch`, a stand-in for #129's join path, and the real participant and host transports.
 *
 * This is what `describeRoomConformance` is handed, so the suite that drives the in-memory adapter
 * drives this one unchanged.
 *
 * **Where the stand-in stops.** Only one thing here pretends to be product code: `joinSession`,
 * because #129 owns the join route, `public.participants` and the token. It does exactly what that
 * route will do — look the code up among sessions that have not ended, mint a participant id, sign
 * a token — and nothing more, so what the conformance suite exercises is this adapter's own
 * behaviour: that it validates the name before spending a round trip, that joining twice is one
 * join, that it presents the token on every later call, and that the two refusals which really are
 * the server's are passed through as refusals.
 */
import { LiveSessionError, type LiveSessionState, type LiveSessionTransport } from "@/lib/live";
import { normalizeSessionCode } from "@/lib/live/sessionCode";
import type { ConformanceRoom, ConformanceRoomOptions } from "@/lib/live/roomConformance";
import type { Item } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { createSupabaseHost } from "../hostTransport";
import { createSupabaseParticipant } from "../participantTransport";
import { bearerToken, signParticipantToken, verifyParticipantToken } from "../participantToken";
import type { LiveRouteDeps } from "../routeDeps";
import { submitSessionResponse } from "../submitRoute";
import { readParticipantView } from "../viewRoute";
import { LIVE_ROUTES, type JoinSession } from "../wire";
import { FakeSupabase, createFakeClient, type FakeSessionRow } from "./fakeSupabase";

const TEST_SECRET = "a-test-only-signing-secret-of-ample-length";
const ORG_ID = "00000000-0000-0000-0000-0000000131aa";
const HOST_ID = "00000000-0000-0000-0000-0000000131bb";
const ORIGIN = "http://live.test";

export interface FakeRoom extends ConformanceRoom {
  readonly stack: FakeSupabase;
  readonly orgId: string;
  /** The stand-in for #129's join path, so a test can wrap it — slow it down, make it fail. */
  readonly joinSession: JoinSession;
  /** A participant whose join path is the caller's, for the races a conformance test cannot pose. */
  participantWith(join: JoinSession): LiveSessionTransport;
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
    mode: "instructor_paced",
    status: "lobby",
    item_set: items.map((_, index) => rowId(index)),
    current_position: null,
    reveal: false,
    item_ends_at: null,
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
    updated_at: stack.now(),
  });

  const service = createFakeClient(stack, { role: "service" });
  const deps: LiveRouteDeps = {
    verify: (request) => verifyParticipantToken(bearerToken(request), { secret: TEST_SECRET }),
    service,
  };

  /** The two real route handlers, behind a real `Request` and a real `Response`. */
  const call: typeof globalThis.fetch = async (input, init) => {
    stack.touch();
    const url = typeof input === "string" ? input : String(input);
    const request = new Request(url, init);
    const path = new URL(url).pathname;
    const response =
      path === LIVE_ROUTES.view
        ? await readParticipantView(request, deps)
        : path === LIVE_ROUTES.submit
          ? await submitSessionResponse(request, deps)
          : new Response("not found", { status: 404 });
    // Everything the participant's process is handed, as bytes, for the payload test to read.
    stack.record({ kind: "http", label: `POST ${path}`, body: await response.clone().text() });
    return response;
  };

  let nextParticipant = 0;
  const joinSession: JoinSession = async (code, identity) => {
    const typed = normalizeSessionCode(code);
    const match = stack.sessions.find((row) => row.code === typed);
    if (!match) throw new LiveSessionError("unknown_code");
    if (match.status === "ended") throw new LiveSessionError("not_open");
    nextParticipant += 1;
    const participantId = `00000000-0000-0000-0000-${String(nextParticipant).padStart(12, "9")}`;
    return {
      sessionId: match.id,
      participantId,
      code: match.code,
      mode: match.mode,
      displayName: identity.displayName,
      joinedAt: nextParticipant,
      token: await signParticipantToken(
        { sessionId: match.id, participantId },
        {
          secret: TEST_SECRET,
        },
      ),
    };
  };

  const participantWith = (join: JoinSession): LiveSessionTransport =>
    createSupabaseParticipant({
      client: createFakeClient(stack, { role: "anon" }),
      join,
      fetch: call,
      baseUrl: ORIGIN,
    });

  return {
    stack,
    orgId: ORG_ID,
    joinSession,
    participantWith,
    sessionId: session.id,
    code: session.code,
    mode: session.mode,

    async currentState(): Promise<LiveSessionState> {
      const held = stack.sessions.find((row) => row.id === session.id) as FakeSessionRow;
      return {
        status: held.status,
        position: held.current_position,
        itemCount: held.item_set.length,
        reveal: held.reveal,
      };
    },

    participant: () => participantWith(joinSession),

    host: () =>
      createSupabaseHost({
        client: createFakeClient(stack, { role: "authenticated", orgId: ORG_ID }),
        sessionId: session.id,
      }),

    settle: () => stack.settle(),
    dispose: async () => {
      await stack.settle();
    },
  };
}
