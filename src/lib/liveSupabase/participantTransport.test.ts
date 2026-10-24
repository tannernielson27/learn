import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_TIMER, type LiveSessionState } from "@/lib/live";
import type { Database } from "@/lib/supabase/database.types";
import {
  REFRESH_BACKOFF_CAP_MS,
  VIEW_POLL_MS,
  WAKE_GAP_MS,
  createSupabaseParticipant,
  publicStateFrom,
  type RoomConnection,
  type StudentView,
  type SupabaseParticipant,
} from "./participantTransport";
import type { ChannelRefusal } from "./channelTokenSource";
import {
  LIVE_REQUEST_TIMEOUT_MS,
  liveTopic,
  requestTimeout,
  type ParticipantViewPayload,
} from "./wire";

/**
 * Every phone a test opened, left once it is over: a phone whose socket never came up keeps
 * reading the room on a timer, and that timer must not outlive its test.
 */
const opened: SupabaseParticipant[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((transport) => transport.leave()));
  vi.useRealTimers();
});

/**
 * The half of the participant transport a whole fake stack cannot pose: a socket whose lifecycle
 * a test drives by hand, and the arithmetic of how many requests a move costs.
 *
 * Everything that needs a database behind it — joining, answering, the refusals, what reaches the
 * wire — is in `supabaseRoom.test.ts`, against the real route handlers.
 */

const SESSION_ID = "00000000-0000-0000-0000-0000000132aa";
const ME = {
  sessionId: SESSION_ID,
  participantId: "00000000-0000-4000-8000-000000000001",
  displayName: "Sam Okafor",
  joinedAt: 100,
};

const LOBBY: ParticipantViewPayload = {
  state: { status: "lobby", position: null, itemCount: 2, reveal: false, timer: NO_TIMER },
  item: null,
  answered: null,
  revealed: null,
  serverNow: Date.now(),
};

/** The state fields of a view, with no timer on them unless a test says so. */
const at = (
  state: Omit<LiveSessionState, "timer"> & Partial<Pick<LiveSessionState, "timer">>,
): LiveSessionState => ({ timer: NO_TIMER, ...state });

const stateRow = (over: Partial<Record<string, unknown>> = {}) => ({
  session_id: SESSION_ID,
  status: "running",
  item_position: 1,
  item_count: 2,
  reveal: false,
  timer_seconds: null,
  item_ends_at: null,
  timer_remaining_ms: null,
  ...over,
});

/** The three clock columns, as the mirror carries them when no timer is on. */
const NO_CLOCK = { timer_seconds: null, item_ends_at: null, timer_remaining_ms: null };

describe("publicStateFrom", () => {
  it("reads the four facts the mirror carries", () => {
    expect(
      publicStateFrom({
        status: "running",
        item_position: 2,
        item_count: 9,
        reveal: true,
        ...NO_CLOCK,
      }),
    ).toEqual({ status: "running", position: 2, itemCount: 9, reveal: true, timer: NO_TIMER });
  });

  it("takes a lobby row, where there is no position yet", () => {
    expect(
      publicStateFrom({
        status: "lobby",
        item_position: null,
        item_count: 9,
        reveal: false,
        ...NO_CLOCK,
      }),
    ).toEqual({ status: "lobby", position: null, itemCount: 9, reveal: false, timer: NO_TIMER });
  });

  it("reads the item's clock, which the mirror carries since #182", () => {
    expect(
      publicStateFrom(
        stateRow({ timer_seconds: 30, item_ends_at: "2027-01-15T08:00:30.250+00:00" }),
      )?.timer,
    ).toEqual({ seconds: 30, endsAt: Date.parse("2027-01-15T08:00:30.250Z"), remainingMs: null });
    expect(
      publicStateFrom(stateRow({ status: "paused", timer_seconds: 30, timer_remaining_ms: 12_000 }))
        ?.timer,
    ).toEqual({ seconds: 30, endsAt: null, remainingMs: 12_000 });
  });

  it("refuses a row without the clock, rather than guessing there is none", () => {
    expect(
      publicStateFrom({ status: "running", item_position: 2, item_count: 9, reveal: true }),
    ).toBeNull();
    expect(publicStateFrom(stateRow({ item_ends_at: "soon" }))).toBeNull();
  });

  it("refuses anything that is not one of those rows", () => {
    expect(publicStateFrom(null)).toBeNull();
    expect(publicStateFrom({})).toBeNull();
    expect(publicStateFrom({ status: "sideways", item_count: 1, reveal: false })).toBeNull();
    expect(
      publicStateFrom({ status: "running", item_position: "2", item_count: 1, reveal: false }),
    ).toBeNull();
    expect(
      publicStateFrom({ status: "running", item_position: 2, item_count: 1, reveal: "yes" }),
    ).toBeNull();
  });
});

interface Recorded {
  views: StudentView[];
  states: LiveSessionState[];
  counts: number[];
  connections: { status: RoomConnection; rejoined: boolean }[];
}

/** A channel token source a test can make refuse, as the server would for good (#149). */
function refusableTokens() {
  const listeners = new Set<(why: ChannelRefusal) => void>();
  return {
    onRefused(listener: (why: ChannelRefusal) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refuse(why: ChannelRefusal) {
      for (const listener of listeners) listener(why);
    },
  };
}

/**
 * A network a test scripts (#407): what the nth request for the view is answered with instead of
 * the next view (a status, or `"dropped"` for a request that never got an answer), and the waits
 * and the jitter the transport is given, so no test sleeps.
 */
interface ScriptedNetwork {
  failing?: (asked: number) => number | "dropped" | null;
  pause?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** A phone on a socket a test drives, answering `/api/live/view` from a script. */
function phone(
  views: ParticipantViewPayload[] = [LOBBY],
  tokens?: ReturnType<typeof refusableTokens>,
  network: ScriptedNetwork = {},
) {
  const socket = fakeSocket();
  let asked = 0;
  let requests = 0;
  const call = vi.fn(async () => {
    requests += 1;
    const failure = network.failing?.(requests) ?? null;
    if (failure === "dropped") throw new TypeError("Failed to fetch");
    if (failure !== null) {
      return new Response(JSON.stringify({ error: "no" }), {
        status: failure,
        headers: { "content-type": "application/json" },
      });
    }
    const payload = views[Math.min(asked, views.length - 1)] as ParticipantViewPayload;
    asked += 1;
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  });

  const transport = createSupabaseParticipant({
    client: socket.client,
    tokens,
    fetch: call as unknown as typeof globalThis.fetch,
    baseUrl: "http://live.test",
    ...(network.pause === undefined ? {} : { pause: network.pause }),
    ...(network.random === undefined ? {} : { random: network.random }),
  });
  opened.push(transport);

  const recorded: Recorded = { views: [], states: [], counts: [], connections: [] };
  transport.onStudentView((view) => recorded.views.push(view));
  transport.onSessionState((view) => recorded.states.push(view.state));
  transport.onCount((count) => recorded.counts.push(count));
  transport.onConnection((status, rejoined) => recorded.connections.push({ status, rejoined }));

  return {
    socket,
    transport,
    recorded,
    asks: () => call.mock.calls.length,
    call,
    /** Resumes and brings the socket up, the way the fake stack would. */
    async enter(): Promise<StudentView> {
      const opened = transport.resume(ME);
      // The room is read without waiting for the socket, so the entry may fail before it is up;
      // the caller is handed that failure below, not an unhandled rejection meanwhile.
      opened.catch(() => {});
      await socket.subscribed();
      socket.emit("SUBSCRIBED");
      return opened;
    },
  };
}

describe("resuming a room a phone is already in", () => {
  it("opens the channel, tracks this phone, and reads the room once", async () => {
    const live = phone();
    const view = await live.enter();

    expect(view).toEqual({ state: LOBBY.state, item: null, answered: null, revealed: null });
    expect(live.socket.topic).toBe(liveTopic(SESSION_ID));
    expect(live.socket.tracked).toEqual([
      { participantId: ME.participantId, displayName: "Sam Okafor", joinedAt: 100 },
    ]);
    expect(live.asks()).toBe(1);
    expect(live.recorded.connections).toEqual([
      { status: "connecting", rejoined: false },
      { status: "live", rejoined: false },
    ]);
  });

  it("opens the session's channel as a private one (#149)", async () => {
    const live = phone();
    await live.enter();
    expect(live.socket.options).toMatchObject({
      config: { private: true, presence: { key: ME.participantId } },
    });
  });

  it("hands Realtime its token before it subscribes, not after (#149)", async () => {
    // Subscribing first joins with the publishable key's default token, which a private channel
    // refuses — and the socket's own rejoins keep presenting it. See `presentRealtimeToken`.
    const live = phone();
    await live.enter();
    expect(live.socket.order).toEqual(["setAuth", "subscribe"]);
  });

  it("opens nothing when it is left while the token is still being fetched", async () => {
    const live = phone();
    const opening = live.transport.resume(ME);
    await live.transport.leave();
    await expect(opening).rejects.toMatchObject({ code: "not_joined" });
    expect(live.socket.channels).toBe(0);
  });

  it("subscribes to the mirror in the schema the Data API cannot serve", async () => {
    const live = phone();
    await live.enter();
    expect(live.socket.bindings[0]).toMatchObject({
      schema: "live",
      table: "session_public_state",
      filter: `session_id=eq.${SESSION_ID}`,
    });
  });

  it("binds no presence listener, so Realtime joins it with presence off (#426)", async () => {
    // realtime-js joins with `presence.enabled` true when a presence listener is bound, or when
    // the config says so. Neither: the phone tracks itself and asks for nobody else.
    const live = phone();
    await live.enter();
    expect(live.socket.presenceBindings).toBe(0);
    expect(live.socket.options).not.toMatchObject({ config: { presence: { enabled: true } } });
    expect(live.socket.tracked).toHaveLength(1);
  });

  it("is one resume however many times an effect re-runs", async () => {
    const live = phone();
    await live.enter();
    await live.transport.resume(ME);
    // One channel, and the second call re-read the room rather than opening another.
    expect(live.socket.channels).toBe(1);
  });

  it("refuses to answer before it has entered a room", async () => {
    const live = phone();
    await expect(
      live.transport.submit("item", { type: "multiple_choice", optionId: "a" }),
    ).rejects.toMatchObject({ code: "not_joined" });
  });
});

describe("the count on the waiting screen (#426)", () => {
  const LOBBY_ROW = { status: "lobby", item_position: null };

  it("is handed the count with the room on the way in", async () => {
    const live = phone([{ ...LOBBY, count: 7 }]);
    await live.enter();
    expect(live.recorded.counts).toEqual([7]);
  });

  it("takes a new count from a state row, with no request and without repainting the room", async () => {
    const live = phone([{ ...LOBBY, count: 7 }]);
    await live.enter();
    const views = live.recorded.views.length;
    const states = live.recorded.states.length;

    live.socket.deliver({ new: stateRow({ ...LOBBY_ROW, participant_count: 9 }) });
    expect(live.recorded.counts.at(-1)).toBe(9);
    expect(live.asks()).toBe(1);
    expect(live.recorded.views).toHaveLength(views);
    expect(live.recorded.states).toHaveLength(states);
  });

  it("takes the count and the move from a row that carries both", async () => {
    const live = phone([
      { ...LOBBY, state: at({ status: "running", position: 1, itemCount: 2, reveal: false }) },
    ]);
    await live.enter();
    live.socket.deliver({ new: stateRow({ status: "paused", participant_count: 4 }) });
    expect(live.recorded.states.at(-1)).toMatchObject({ status: "paused" });
    expect(live.recorded.counts.at(-1)).toBe(4);
    expect(live.asks()).toBe(1);
  });

  it("tells nobody when the number has not changed", async () => {
    const live = phone([{ ...LOBBY, count: 7 }]);
    await live.enter();
    live.socket.deliver({ new: stateRow({ ...LOBBY_ROW, participant_count: 7 }) });
    expect(live.recorded.counts).toEqual([7]);
  });

  it("goes down when someone leaves: a smaller number in a row is shown", async () => {
    // Someone who has left is not counted (owner decision, 2026-10-21).
    const live = phone([{ ...LOBBY, count: 7 }]);
    await live.enter();
    live.socket.deliver({ new: stateRow({ ...LOBBY_ROW, participant_count: 5 }) });
    expect(live.recorded.counts).toEqual([7, 5]);
  });

  it("keeps the row's number over a view read once a row has come", async () => {
    // Rows arrive in the order they were written; a view's count was read at some moment in
    // between and may be older, so it only stands in until the first row.
    const running = (position: number, count: number) => ({
      ...LOBBY,
      state: at({ status: "running", position, itemCount: 2, reveal: false }),
      count,
    });
    const live = phone([running(1, 7), running(2, 9)]);
    await live.enter();
    live.socket.deliver({ new: stateRow({ item_position: 2, participant_count: 5 }) });
    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 2 }));
    expect(live.recorded.counts).toEqual([7, 5]);
  });

  it("ignores a count that is not a count", async () => {
    const live = phone([{ ...LOBBY, count: 7 }]);
    await live.enter();
    for (const odd of ["12", -1, 1.5, Number.NaN, null]) {
      live.socket.deliver({ new: stateRow({ ...LOBBY_ROW, participant_count: odd }) });
    }
    expect(live.recorded.counts).toEqual([7]);
  });

  it("says nothing before a database that has no count has given one", async () => {
    // A view read on the old path (`begin_session_view`) carries no count.
    const live = phone([LOBBY]);
    await live.enter();
    live.socket.deliver({ new: stateRow(LOBBY_ROW) });
    expect(live.recorded.counts).toEqual([]);
  });

  it("tells nobody once the phone has left", async () => {
    const live = phone([{ ...LOBBY, count: 7 }]);
    await live.enter();
    await live.transport.leave();
    live.socket.deliver({ new: stateRow({ ...LOBBY_ROW, participant_count: 9 }) });
    expect(live.recorded.counts).toEqual([7]);
  });
});

describe("what a state message costs", () => {
  it("shows a pause from the message itself, with no request at all", async () => {
    const live = phone([
      { ...LOBBY, state: at({ status: "running", position: 1, itemCount: 2, reveal: false }) },
    ]);
    await live.enter();
    expect(live.asks()).toBe(1);

    // `replica identity full` puts the whole row in the message, and the item has not changed.
    live.socket.deliver({ new: stateRow({ status: "paused" }) });
    expect(live.asks()).toBe(1);
    expect(live.recorded.states.at(-1)).toMatchObject({ status: "paused", position: 1 });
  });

  it("asks the server again when the room moves to another item", async () => {
    const live = phone([
      { ...LOBBY, state: at({ status: "running", position: 1, itemCount: 2, reveal: false }) },
      { ...LOBBY, state: at({ status: "running", position: 2, itemCount: 2, reveal: false }) },
    ]);
    await live.enter();
    live.socket.deliver({ new: stateRow({ item_position: 2 }) });
    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 2 }));
    expect(live.asks()).toBe(2);
  });

  it("asks the server again when the key goes up, because the key is the server's to give", async () => {
    const live = phone([
      { ...LOBBY, state: at({ status: "running", position: 1, itemCount: 2, reveal: false }) },
      { ...LOBBY, state: at({ status: "running", position: 1, itemCount: 2, reveal: true }) },
    ]);
    await live.enter();
    live.socket.deliver({ new: stateRow({ reveal: true }) });
    await vi.waitFor(() => expect(live.asks()).toBe(2));
  });

  it("asks rather than guessing when the payload is not a state row", async () => {
    const live = phone();
    await live.enter();
    live.socket.deliver({ new: { nonsense: true } });
    await vi.waitFor(() => expect(live.asks()).toBe(2));
  });
});

describe("a move made while the subscription was coming up (#193)", () => {
  const RUNNING: ParticipantViewPayload = {
    ...LOBBY,
    state: at({ status: "running", position: 1, itemCount: 2, reveal: false }),
  };

  it("lands on the current item when the subscription confirms after the room moved", async () => {
    // The phone subscribes and reads the lobby. The host presses Start before Realtime has the
    // replication subscription streaming, so that change is never delivered to this phone.
    const live = phone([LOBBY, RUNNING]);
    const view = await live.enter();
    expect(view.state.status).toBe("lobby");

    // Realtime says the subscription is live. Nothing was replayed, so the phone asks once.
    live.socket.confirm();
    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 1 }));
    expect(live.recorded.views.at(-1)).toMatchObject({ state: { status: "running", position: 1 } });
    expect(live.asks()).toBe(2);
  });

  it("does not show the same view twice when nothing moved in the gap", async () => {
    const live = phone([LOBBY]);
    await live.enter();
    const shown = live.recorded.views.length;

    live.socket.confirm();
    await vi.waitFor(() => expect(live.asks()).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.recorded.views).toHaveLength(shown);
    expect(live.recorded.states).toHaveLength(shown);
  });

  it("asks nothing for a system message that is not the subscription coming up", async () => {
    const live = phone([LOBBY, RUNNING]);
    await live.enter();
    live.socket.confirm({ ...POSTGRES_READY, status: "error", message: "Error 401" });
    live.socket.confirm({ extension: "system", status: "ok", message: "Replication ready" });
    live.socket.confirm({ nonsense: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.asks()).toBe(1);
  });

  it("asks again after a reconnect, whose subscription also comes up late", async () => {
    const live = phone([
      LOBBY,
      LOBBY,
      { ...RUNNING, state: at({ status: "running", position: 2, itemCount: 2, reveal: false }) },
    ]);
    await live.enter();
    live.socket.emit("CHANNEL_ERROR");
    live.socket.emit("SUBSCRIBED");
    await vi.waitFor(() => expect(live.asks()).toBe(2));

    live.socket.confirm();
    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 2 }));
  });

  it("keeps the newer read when an older one lands after it", async () => {
    // The entry's read is slow; the confirmation's read, sent later, comes back first.
    const socket = fakeSocket();
    const answers: ((payload: ParticipantViewPayload) => void)[] = [];
    const call = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answers.push((payload) =>
            resolve(
              new Response(JSON.stringify(payload), {
                headers: { "content-type": "application/json" },
              }),
            ),
          );
        }),
    );
    const transport = createSupabaseParticipant({
      client: socket.client,
      fetch: call as unknown as typeof globalThis.fetch,
    });
    const states: LiveSessionState[] = [];
    transport.onSessionState((view) => states.push(view.state));

    const opening = transport.resume(ME);
    await socket.subscribed();
    socket.emit("SUBSCRIBED");
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    socket.confirm();
    await vi.waitFor(() => expect(answers).toHaveLength(2));

    answers[1]?.(RUNNING);
    await vi.waitFor(() => expect(states.at(-1)).toMatchObject({ position: 1 }));
    answers[0]?.(LOBBY);
    const view = await opening;

    expect(view.state).toMatchObject({ status: "running", position: 1 });
    expect(states).toHaveLength(1);
  });

  it("asks nothing once the phone has left", async () => {
    const live = phone([LOBBY, RUNNING]);
    await live.enter();
    await live.transport.leave();
    live.socket.confirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.asks()).toBe(1);
  });
});

describe("the item's clock (#182)", () => {
  it("takes fifteen more seconds from the message itself, with no request", async () => {
    const live = phone([
      { ...LOBBY, state: at({ status: "running", position: 1, itemCount: 2, reveal: false }) },
    ]);
    await live.enter();
    const endsAt = "2027-01-15T08:00:45.000+00:00";
    live.socket.deliver({ new: stateRow({ timer_seconds: 30, item_ends_at: endsAt }) });
    expect(live.asks()).toBe(1);
    expect(live.recorded.states.at(-1)?.timer).toEqual({
      seconds: 30,
      endsAt: Date.parse(endsAt),
      remainingMs: null,
    });
  });

  it("reads the session's clock on a phone whose own clock is two minutes slow", async () => {
    // What the server says the time is, two minutes ahead of this phone's clock.
    const live = phone([{ ...LOBBY, serverNow: Date.now() + 120_000 }]);
    await live.enter();
    const ahead = live.transport.serverNow() - Date.now();
    expect(Math.abs(ahead - 120_000)).toBeLessThan(1_000);
  });

  it("uses its own clock until it has heard the server's", () => {
    const live = phone();
    expect(Math.abs(live.transport.serverNow() - Date.now())).toBeLessThan(1_000);
  });
});

describe("a view that did not get through (#407)", () => {
  const ON_ONE = {
    ...LOBBY,
    state: at({ status: "running", position: 1, itemCount: 2, reveal: false }),
  };
  const ON_TWO = {
    ...LOBBY,
    state: at({ status: "running", position: 2, itemCount: 2, reveal: false }),
  };

  /** A phone on item one whose waits are recorded and over at once. */
  function waiting(failing: ScriptedNetwork["failing"], random = 0.5) {
    const waits: number[] = [];
    const live = phone([ON_ONE, ON_TWO], undefined, {
      failing,
      random: () => random,
      // Over at once, but after a turn of the event loop: a phone that keeps asking a server that
      // never answers must not starve the test's own timers.
      pause: (ms) => {
        waits.push(ms);
        return new Promise((resolve) => setTimeout(resolve, 0));
      },
    });
    return { live, waits };
  }

  it.each([503, 502, 504, "dropped"] as const)(
    "asks again after %s, and the phone lands on the item",
    async (failure) => {
      // The entry's read is request 1. The host moves, and the read that follows fails once.
      const { live, waits } = waiting((asked) => (asked === 2 ? failure : null));
      await live.enter();
      live.socket.deliver({ new: stateRow({ item_position: 2 }) });

      await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 2 }));
      expect(live.asks()).toBe(3);
      expect(waits).toEqual([400]);
    },
  );

  it("does not give up after four tries: it keeps asking, further apart, until one gets through", async () => {
    // Requests 2 to 9 fail: the move's own four tries, and the first round of asking again.
    const { live, waits } = waiting((asked) => (asked > 1 && asked < 10 ? 503 : null));
    await live.enter();
    live.socket.deliver({ new: stateRow({ item_position: 2 }) });

    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 2 }));
    expect(live.asks()).toBe(10);
    // Each round is a read with its own three retries, and the rounds are 2 s, then 4 s, apart.
    expect(waits).toEqual([400, 800, 1600, 2_000, 400, 800, 1600, 4_000]);
  });

  it("caps the wait between rounds, and stops asking once the phone has left", async () => {
    const { live, waits } = waiting((asked) => (asked > 1 ? 503 : null));
    await live.enter();
    live.socket.deliver({ new: stateRow({ item_position: 2 }) });
    const rounds = () => waits.filter((wait) => wait >= 2_000);
    await vi.waitFor(() => expect(rounds().length).toBeGreaterThanOrEqual(6));
    expect(rounds().slice(0, 6)).toEqual([2_000, 4_000, 8_000, 16_000, 16_000, 16_000]);
    expect(Math.max(...waits)).toBe(REFRESH_BACKOFF_CAP_MS);

    await live.transport.leave();
    const asked = live.asks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.asks()).toBeLessThanOrEqual(asked + 1);
    // Still on the item it had: nothing was shown that the server did not say.
    expect(live.recorded.states.at(-1)).toMatchObject({ position: 1 });
  });

  it("spreads a class out: the same failure is not retried at the same moment", async () => {
    const early = waiting((asked) => (asked > 1 && asked < 6 ? 503 : null), 0);
    const late = waiting((asked) => (asked > 1 && asked < 6 ? 503 : null), 0.999);
    for (const { live } of [early, late]) {
      await live.enter();
      live.socket.deliver({ new: stateRow({ item_position: 2 }) });
      await vi.waitFor(() => expect(live.asks()).toBe(6));
    }
    expect(early.waits).toEqual([200, 400, 800, 1_000]);
    expect(late.waits[0]).toBeGreaterThan(590);
    expect(late.waits[2]).toBeLessThanOrEqual(2_400);
  });

  it.each([401, 409, 429, 500])(
    "does not ask again after a %s: that is an answer",
    async (status) => {
      const { live, waits } = waiting((asked) => (asked > 1 ? status : null));
      await live.enter();
      live.socket.deliver({ new: stateRow({ item_position: 2 }) });

      await vi.waitFor(() => expect(live.asks()).toBe(2));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(live.asks()).toBe(2);
      expect(waits).toEqual([]);
    },
  );

  it("stops asking the moment the phone leaves the room", async () => {
    let release: () => void = () => {};
    const live = phone([ON_ONE, ON_TWO], undefined, {
      failing: (asked) => (asked > 1 ? 503 : null),
      pause: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    await live.enter();
    live.socket.deliver({ new: stateRow({ item_position: 2 }) });
    await vi.waitFor(() => expect(live.asks()).toBe(2));

    await live.transport.leave();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.asks()).toBe(2);
  });

  it("keeps what the later request said when a retried read lands after a newer one", async () => {
    // Request 2 (the first move's read) fails and waits. Request 3 (the second move's read) is
    // answered meanwhile. Then request 2 is tried again as request 4, and the server, asked
    // last, says the most. A read numbered by when it began would be thrown away here.
    let release: () => void = () => {};
    const SHOWN = { ...ON_TWO, state: { ...ON_TWO.state, reveal: true } };
    const live = phone([ON_ONE, ON_TWO, SHOWN], undefined, {
      failing: (asked) => (asked === 2 ? 503 : null),
      pause: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    await live.enter();
    live.socket.deliver({ new: stateRow({ item_position: 2 }) });
    await vi.waitFor(() => expect(live.asks()).toBe(2));
    live.socket.deliver({ new: stateRow({ item_position: 2, reveal: true }) });
    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 2 }));
    expect(live.recorded.states.at(-1)).toMatchObject({ reveal: false });

    release();
    await vi.waitFor(() => expect(live.asks()).toBe(4));
    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ reveal: true }));
  });

  it("tells the page when the room could not be read on the way in, after trying", async () => {
    const { live, waits } = waiting(() => 503);
    await expect(live.enter()).rejects.toThrow("The session could not be reached.");
    expect(live.asks()).toBe(4);
    expect(waits).toHaveLength(3);
  });
});

describe("a socket that drops", () => {
  it("re-tracks, re-reads and says it rejoined when it comes back", async () => {
    const live = phone();
    await live.enter();
    live.socket.emit("CHANNEL_ERROR");
    live.socket.emit("SUBSCRIBED");
    await vi.waitFor(() => expect(live.asks()).toBe(2));

    expect(live.recorded.connections).toEqual([
      { status: "connecting", rejoined: false },
      { status: "live", rejoined: false },
      { status: "reconnecting", rejoined: false },
      { status: "live", rejoined: true },
    ]);
    // Presence is re-sent on every rejoin: Realtime replays nothing, so a phone that does not
    // track again is a name missing from the front of the class.
    expect(live.socket.tracked).toHaveLength(2);
  });

  it("reads the room when the channel comes up after the first attempt failed", async () => {
    const live = phone();
    // The socket fails before it ever subscribes. The room is read over HTTP all the same.
    const opening = live.transport.resume(ME);
    await live.socket.subscribed();
    live.socket.emit("CHANNEL_ERROR");
    await expect(opening).resolves.toMatchObject({ state: LOBBY.state });
    expect(live.asks()).toBe(1);

    // Realtime retries by itself and gets through. Nothing was replayed while it was down, so
    // coming up has to mean asking again — not just tracking presence.
    live.socket.emit("SUBSCRIBED");
    await vi.waitFor(() => expect(live.asks()).toBe(2));
    expect(live.socket.tracked).toHaveLength(1);
    // And the caller is told it rejoined, so a screen holding a stale server render asks again.
    expect(live.recorded.connections.at(-1)).toEqual({ status: "live", rejoined: true });
  });

  it("closes the channel and says `refused` when the server will not issue another token (#149)", async () => {
    const tokens = refusableTokens();
    const live = phone([LOBBY], tokens);
    await live.enter();

    tokens.refuse("signed_out");
    expect(live.recorded.connections.at(-1)).toEqual({ status: "refused", rejoined: false });
    // The channel goes, so Realtime stops retrying a socket that can only ever be refused.
    expect(live.socket.client.removeChannel).toHaveBeenCalledTimes(1);
    // And a socket status arriving afterwards is not mistaken for the room coming back.
    live.socket.emit("CHANNEL_ERROR");
    expect(live.recorded.connections.filter((entry) => entry.status === "refused")).toHaveLength(1);
  });

  it("says nothing about a refusal once the phone has left", async () => {
    const tokens = refusableTokens();
    const live = phone([LOBBY], tokens);
    await live.enter();
    await live.transport.leave();
    tokens.refuse("ended");
    expect(live.recorded.connections.map((entry) => entry.status)).not.toContain("refused");
  });

  it("calls a room that timed out or closed reconnecting", async () => {
    const live = phone();
    await live.enter();
    live.socket.emit("TIMED_OUT");
    live.socket.emit("CLOSED");
    expect(live.recorded.connections.map((entry) => entry.status)).toEqual([
      "connecting",
      "live",
      "reconnecting",
      "reconnecting",
    ]);
  });

  it("stops listening once the phone leaves, and leaving twice is harmless", async () => {
    const live = phone();
    await live.enter();
    await live.transport.leave();
    await live.transport.leave();

    const before = live.recorded.states.length;
    live.socket.deliver({ new: stateRow({ item_position: 2 }) });
    live.socket.sync();
    await vi.waitFor(() => expect(live.asks()).toBe(1));
    expect(live.recorded.states).toHaveLength(before);
  });
});

describe("a phone whose socket never opens (campus Wi-Fi that filters WebSockets)", () => {
  const ON_ONE: ParticipantViewPayload = {
    ...LOBBY,
    state: at({ status: "running", position: 1, itemCount: 2, reveal: false }),
  };
  const ON_TWO: ParticipantViewPayload = {
    ...LOBBY,
    state: at({ status: "running", position: 2, itemCount: 2, reveal: false }),
  };
  const ENDED: ParticipantViewPayload = {
    ...LOBBY,
    state: at({ status: "ended", position: 2, itemCount: 2, reveal: false }),
  };

  /** A phone with its jitter pinned to the middle, so a poll comes every `VIEW_POLL_MS` exactly. */
  function blocked(
    views: ParticipantViewPayload[],
    failing?: ScriptedNetwork["failing"],
  ): ReturnType<typeof phone> {
    vi.useFakeTimers();
    return phone(views, undefined, {
      random: () => 0.5,
      ...(failing === undefined ? {} : { failing }),
    });
  }

  it("shows the room over HTTP without waiting for the socket", async () => {
    const live = blocked([ON_ONE]);
    // No SUBSCRIBED, ever.
    const view = await live.transport.resume(ME);
    expect(view.state).toMatchObject({ status: "running", position: 1 });
    expect(live.recorded.views).toHaveLength(1);
    expect(live.asks()).toBe(1);
  });

  it("reads the room every four seconds or so until the socket is live, and lands on each move", async () => {
    const live = blocked([ON_ONE, ON_ONE, ON_TWO]);
    await live.transport.resume(ME);

    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS - 1);
    expect(live.asks()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(live.asks()).toBe(2);
    // The room had not moved: nothing is repainted.
    expect(live.recorded.views).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS);
    expect(live.asks()).toBe(3);
    expect(live.recorded.views.at(-1)?.state).toMatchObject({ position: 2 });

    // The socket comes up: the channel carries the room from here, and the polling stops.
    await live.socket.subscribed();
    live.socket.emit("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 5);
    expect(live.asks()).toBe(3);
  });

  it("says the room is reachable once a read gets through, and stops saying reconnecting while it is", async () => {
    const live = blocked([ON_ONE]);
    await live.transport.resume(ME);
    await live.socket.subscribed();

    live.socket.emit("TIMED_OUT");
    expect(live.recorded.connections.map((entry) => entry.status)).toEqual([
      "connecting",
      "reconnecting",
    ]);
    // The first failure is followed by a read within a second, not a whole poll later.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(live.asks()).toBe(2);
    expect(live.recorded.connections.at(-1)).toEqual({ status: "live", rejoined: false });

    // Realtime goes on retrying the blocked socket. Each failure is not news to the screen, which
    // keeps its Submit: answers go over HTTP, not over the socket.
    live.socket.emit("CHANNEL_ERROR");
    live.socket.emit("TIMED_OUT");
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 3);
    expect(live.recorded.connections.at(-1)).toEqual({ status: "live", rejoined: false });
    expect(live.recorded.connections.filter((entry) => entry.status === "live")).toHaveLength(1);
  });

  it("says reconnecting when the reads stop getting through as well", async () => {
    let dropping = false;
    const live = blocked([ON_ONE], () => (dropping ? "dropped" : null));
    await live.transport.resume(ME);
    await live.socket.subscribed();
    live.socket.emit("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(live.recorded.connections.at(-1)?.status).toBe("live");

    dropping = true;
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS);
    expect(live.recorded.connections.at(-1)).toEqual({ status: "reconnecting", rejoined: false });

    // And back again when one does.
    dropping = false;
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS);
    expect(live.recorded.connections.at(-1)).toEqual({ status: "live", rejoined: false });
  });

  it("reads the room again when a socket that was live drops, spread over a second", async () => {
    const live = blocked([ON_ONE, ON_TWO]);
    await live.enter();
    expect(live.asks()).toBe(1);

    live.socket.emit("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(live.asks()).toBe(2);
    expect(live.recorded.views.at(-1)?.state).toMatchObject({ position: 2 });
  });

  it("keeps reading when the socket is live but no read of the room has got through", async () => {
    const live = blocked([ON_ONE], (asked) => (asked <= 4 ? 503 : null));
    const entering = live.enter();
    entering.catch(() => {});
    // The entry's own four tries, 0.4 s, 0.8 s and 1.6 s apart.
    await vi.advanceTimersByTimeAsync(2_800);
    await expect(entering).rejects.toThrow("The session could not be reached.");
    expect(live.recorded.views).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS);
    expect(live.recorded.views.at(-1)?.state).toMatchObject({ position: 1 });
    // Then stops: the socket is live and the room has been read.
    const asked = live.asks();
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 5);
    expect(live.asks()).toBe(asked);
  });

  it("stops reading once the session has ended", async () => {
    const live = blocked([ON_ONE, ENDED]);
    await live.transport.resume(ME);
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS);
    expect(live.recorded.views.at(-1)?.state.status).toBe("ended");
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 10);
    expect(live.asks()).toBe(2);
  });

  it("stops reading once the phone leaves", async () => {
    const live = blocked([ON_ONE]);
    await live.transport.resume(ME);
    await live.transport.leave();
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 10);
    expect(live.asks()).toBe(1);
  });

  it("takes a 401 from the view as final: says refused, closes the channel, stops reading", async () => {
    const live = blocked([ON_ONE], (asked) => (asked > 1 ? 401 : null));
    await live.transport.resume(ME);
    await live.socket.subscribed();
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS);
    expect(live.asks()).toBe(2);
    expect(live.recorded.connections.at(-1)).toEqual({ status: "refused", rejoined: false });
    expect(live.socket.client.removeChannel).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 10);
    expect(live.asks()).toBe(2);
    live.socket.emit("SUBSCRIBED");
    expect(live.recorded.connections.at(-1)?.status).toBe("refused");
  });

  it("stays far under the view route's rate limit over an hour with no socket", async () => {
    const live = blocked([ON_ONE]);
    await live.transport.resume(ME);
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    const before = live.asks();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    // `take_session_view` allows 600 in five minutes; one read every four seconds is 75.
    expect(live.asks() - before).toBeLessThanOrEqual(80);
    expect(live.asks()).toBeLessThanOrEqual(60 * 15 + 1);
  });

  it("spreads its reads: no two phones poll in step", async () => {
    vi.useFakeTimers();
    const early = phone([ON_ONE], undefined, { random: () => 0 });
    const late = phone([ON_ONE], undefined, { random: () => 0.999 });
    await early.transport.resume(ME);
    await late.transport.resume(ME);
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 0.875);
    expect(early.asks()).toBe(2);
    expect(late.asks()).toBe(1);
    await vi.advanceTimersByTimeAsync(VIEW_POLL_MS * 0.25);
    expect(late.asks()).toBe(2);
  });
});

describe("a phone coming back to the page (visibility, pageshow, online)", () => {
  const ON_TWO: ParticipantViewPayload = {
    ...LOBBY,
    state: at({ status: "running", position: 2, itemCount: 2, reveal: false }),
  };

  it("reads the room at once, and shows what moved while it slept", async () => {
    vi.useFakeTimers();
    const live = phone([LOBBY, ON_TWO]);
    await live.enter();
    await vi.advanceTimersByTimeAsync(WAKE_GAP_MS);
    live.transport.wake();
    await vi.waitFor(() => expect(live.recorded.views.at(-1)?.state).toMatchObject(ON_TWO.state));
    expect(live.asks()).toBe(2);
  });

  it("repaints nothing when nothing moved", async () => {
    vi.useFakeTimers();
    const live = phone([LOBBY]);
    await live.enter();
    await vi.advanceTimersByTimeAsync(WAKE_GAP_MS);
    live.transport.wake();
    await vi.waitFor(() => expect(live.asks()).toBe(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(live.recorded.views).toHaveLength(1);
  });

  it("makes one read of many rapid wakes: none while one is in flight or under a second after", async () => {
    vi.useFakeTimers();
    let answer = () => {};
    let holding = false;
    const live = phone([LOBBY, ON_TWO]);
    // The second read is held open until the test lets it land.
    const call = live.call.getMockImplementation();
    live.call.mockImplementation(async (...args: unknown[]) => {
      if (holding) await new Promise<void>((resolve) => (answer = resolve));
      return (call as (...args: unknown[]) => Promise<Response>)(...args);
    });
    await live.enter();
    await vi.advanceTimersByTimeAsync(WAKE_GAP_MS);

    // visibilitychange, pageshow and online, fired together and over and over.
    holding = true;
    for (let i = 0; i < 20; i += 1) live.transport.wake();
    expect(live.asks()).toBe(2);
    holding = false;
    answer();
    // Lands without the clock moving, so the second below is counted from here.
    await vi.advanceTimersByTimeAsync(0);
    expect(live.recorded.views.at(-1)?.state).toMatchObject(ON_TWO.state);

    // The room was read a moment ago: more wakes inside the second ask for nothing.
    for (let i = 0; i < 20; i += 1) live.transport.wake();
    await vi.advanceTimersByTimeAsync(WAKE_GAP_MS - 1);
    for (let i = 0; i < 20; i += 1) live.transport.wake();
    expect(live.asks()).toBe(2);

    // Once it has passed, a wake reads the room again.
    await vi.advanceTimersByTimeAsync(1);
    live.transport.wake();
    expect(live.asks()).toBe(3);
  });

  it("asks nothing once the phone has left, or before it has entered", async () => {
    const live = phone([LOBBY]);
    live.transport.wake();
    await live.enter();
    await live.transport.leave();
    live.transport.wake();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.asks()).toBe(1);
  });
});

describe("a request the network swallows", () => {
  it("gives every request a deadline: the view and the answer", async () => {
    const live = phone();
    await live.enter();
    await live.transport.submit("item", { type: "multiple_choice", optionId: "a" });
    for (const [, init] of live.call.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(live.call).toHaveBeenCalledTimes(2);
  });

  it("rejects an answer that timed out, so the student can send it again", async () => {
    const socket = fakeSocket();
    const timedOut = new DOMException("The operation timed out.", "TimeoutError");
    let answers = 0;
    const call = vi.fn(async (url: string) => {
      if (url.endsWith("/api/live/view")) return Response.json(LOBBY);
      answers += 1;
      if (answers === 1) throw timedOut;
      return Response.json({ refusal: "already_answered", error: "x" }, { status: 409 });
    });
    const transport = createSupabaseParticipant({
      client: socket.client,
      fetch: call as unknown as typeof globalThis.fetch,
    });
    opened.push(transport);
    await transport.resume(ME);

    const response = { type: "multiple_choice", optionId: "a" } as const;
    await expect(transport.submit("item", response)).rejects.toBe(timedOut);
    // The first one did land after all: the server says so, and the screen treats that as sent.
    await expect(transport.submit("item", response)).rejects.toMatchObject({
      code: "already_answered",
    });
  });

  it("counts a view that timed out as one that never got an answer, and tries again", async () => {
    const socket = fakeSocket();
    let asked = 0;
    const call = vi.fn(async () => {
      asked += 1;
      if (asked === 1) throw new DOMException("The operation timed out.", "TimeoutError");
      return Response.json(LOBBY);
    });
    const transport = createSupabaseParticipant({
      client: socket.client,
      fetch: call as unknown as typeof globalThis.fetch,
      pause: async () => {},
    });
    opened.push(transport);
    await expect(transport.resume(ME)).resolves.toMatchObject({ state: LOBBY.state });
    expect(asked).toBe(2);
  });

  it("counts a body that never finished arriving as no answer, and asks again", async () => {
    const socket = fakeSocket();
    let asked = 0;
    const call = vi.fn(async () => {
      asked += 1;
      if (asked === 1) {
        // Headers in, then the deadline falls while the body is still on its way.
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException("The operation timed out.", "TimeoutError"));
            },
          }),
        );
      }
      return Response.json(LOBBY);
    });
    const transport = createSupabaseParticipant({
      client: socket.client,
      fetch: call as unknown as typeof globalThis.fetch,
      pause: async () => {},
    });
    opened.push(transport);
    const opening = transport.resume(ME);
    opening.catch(() => {});
    await socket.subscribed();
    socket.emit("SUBSCRIBED");
    await expect(opening).rejects.toThrow("The session could not be reached.");
    // The entry's read is the page's to report; the next one, from the poll or a move, gets through.
    transport.wake();
    await vi.waitFor(() => expect(asked).toBe(2));
  });

  it("aborts after eight seconds, also where the browser has no AbortSignal.timeout", () => {
    vi.useFakeTimers();
    const native = AbortSignal.timeout;
    try {
      // Safari before 16.
      Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
      const signal = requestTimeout();
      vi.advanceTimersByTime(LIVE_REQUEST_TIMEOUT_MS - 1);
      expect(signal.aborted).toBe(false);
      vi.advanceTimersByTime(1);
      expect(signal.aborted).toBe(true);
    } finally {
      Object.defineProperty(AbortSignal, "timeout", { value: native, configurable: true });
    }
    expect(requestTimeout()).toBeInstanceOf(AbortSignal);
  });
});

/** A channel whose lifecycle a test drives by hand, for the statuses a fake stack never sends. */
function fakeSocket() {
  const listeners: ((status: string) => void)[] = [];
  const bindings: Record<string, string | undefined>[] = [];
  const changes: ((message: { new: Record<string, unknown> }) => void)[] = [];
  const systems: ((payload: Record<string, unknown>) => void)[] = [];
  const syncs: (() => void)[] = [];
  const tracked: Record<string, unknown>[] = [];
  const order: string[] = [];
  let topic = "";
  let options: unknown = undefined;
  let channels = 0;
  let presenceBindings = 0;

  const channel = {
    on(
      type: string,
      options: Record<string, string | undefined>,
      listener: (message: { new: Record<string, unknown> }) => void,
    ) {
      if (type === "presence") {
        presenceBindings += 1;
        syncs.push(() => listener({ new: {} }));
      } else if (type === "system") {
        systems.push(listener as unknown as (payload: Record<string, unknown>) => void);
      } else {
        bindings.push(options);
        changes.push(listener);
      }
      return channel;
    },
    subscribe(callback: (status: string) => void) {
      order.push("subscribe");
      listeners.push(callback);
      return channel;
    },
    track: vi.fn(async (entry: Record<string, unknown>) => {
      tracked.push(entry);
      return "ok" as const;
    }),
    untrack: vi.fn(async () => "ok" as const),
    presenceState: () => ({}),
  };

  const client = {
    channel(name: string, given?: unknown) {
      topic = name;
      options = given;
      channels += 1;
      return channel;
    },
    removeChannel: vi.fn(async () => "ok" as const),
    realtime: {
      setAuth: vi.fn(async () => {
        order.push("setAuth");
      }),
    },
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    bindings,
    tracked,
    order,
    get options() {
      return options;
    },
    /** Waits for the transport to subscribe, which it does only once its token is in. */
    subscribed: () => vi.waitFor(() => expect(listeners.length).toBeGreaterThan(0)),
    get topic() {
      return topic;
    },
    get channels() {
      return channels;
    },
    get presenceBindings() {
      return presenceBindings;
    },
    emit: (status: string) => {
      for (const listener of listeners) listener(status);
    },
    deliver: (message: { new: Record<string, unknown> }) => {
      for (const listener of changes) listener(message);
    },
    sync: () => {
      for (const listener of syncs) listener();
    },
    /**
     * The server's word that the `postgres_changes` subscription is live, which Realtime sends
     * some time *after* `SUBSCRIBED` (#193). Until it does, a change to the mirror is not delivered.
     */
    confirm: (payload: Record<string, unknown> = POSTGRES_READY) => {
      for (const listener of systems) listener(payload);
    },
  };
}

/** What Realtime sends once the replication subscription behind a channel is streaming. */
const POSTGRES_READY = {
  extension: "postgres_changes",
  status: "ok",
  message: "Subscribed to PostgreSQL",
  channel: `live:${SESSION_ID}`,
};
