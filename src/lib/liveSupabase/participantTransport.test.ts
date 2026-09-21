import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { LiveSessionState, Participant } from "@/lib/live";
import type { Database } from "@/lib/supabase/database.types";
import {
  createSupabaseParticipant,
  publicStateFrom,
  type RoomConnection,
  type StudentView,
} from "./participantTransport";
import { liveTopic, type ParticipantViewPayload } from "./wire";

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
  state: { status: "lobby", position: null, itemCount: 2, reveal: false },
  item: null,
  answered: null,
  revealed: null,
};

const stateRow = (over: Partial<Record<string, unknown>> = {}) => ({
  session_id: SESSION_ID,
  status: "running",
  item_position: 1,
  item_count: 2,
  reveal: false,
  ...over,
});

describe("publicStateFrom", () => {
  it("reads the four facts the mirror carries", () => {
    expect(
      publicStateFrom({ status: "running", item_position: 2, item_count: 9, reveal: true }),
    ).toEqual({ status: "running", position: 2, itemCount: 9, reveal: true });
  });

  it("takes a lobby row, where there is no position yet", () => {
    expect(
      publicStateFrom({ status: "lobby", item_position: null, item_count: 9, reveal: false }),
    ).toEqual({ status: "lobby", position: null, itemCount: 9, reveal: false });
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
  rosters: Participant[][];
  connections: { status: RoomConnection; rejoined: boolean }[];
}

/** A phone on a socket a test drives, answering `/api/live/view` from a script. */
function phone(views: ParticipantViewPayload[] = [LOBBY]) {
  const socket = fakeSocket();
  let asked = 0;
  const call = vi.fn(async () => {
    const payload = views[Math.min(asked, views.length - 1)] as ParticipantViewPayload;
    asked += 1;
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  });

  const transport = createSupabaseParticipant({
    client: socket.client,
    fetch: call as unknown as typeof globalThis.fetch,
    baseUrl: "http://live.test",
  });

  const recorded: Recorded = { views: [], states: [], rosters: [], connections: [] };
  transport.onStudentView((view) => recorded.views.push(view));
  transport.onSessionState((view) => recorded.states.push(view.state));
  transport.onPresence((roster) => recorded.rosters.push(roster));
  transport.onConnection((status, rejoined) => recorded.connections.push({ status, rejoined }));

  return {
    socket,
    transport,
    recorded,
    asks: () => call.mock.calls.length,
    /** Resumes and brings the socket up, the way the fake stack would. */
    async enter(): Promise<StudentView> {
      const opened = transport.resume(ME);
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

    expect(view).toEqual(LOBBY);
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

  it("puts this phone in the roster before any sync has carried it back", async () => {
    const live = phone();
    await live.enter();
    live.socket.sync();
    expect(live.recorded.rosters.at(-1)).toEqual([
      { participantId: ME.participantId, displayName: "Sam Okafor", joinedAt: 100 },
    ]);
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

describe("what a state message costs", () => {
  it("shows a pause from the message itself, with no request at all", async () => {
    const live = phone([
      { ...LOBBY, state: { status: "running", position: 1, itemCount: 2, reveal: false } },
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
      { ...LOBBY, state: { status: "running", position: 1, itemCount: 2, reveal: false } },
      { ...LOBBY, state: { status: "running", position: 2, itemCount: 2, reveal: false } },
    ]);
    await live.enter();
    live.socket.deliver({ new: stateRow({ item_position: 2 }) });
    await vi.waitFor(() => expect(live.recorded.states.at(-1)).toMatchObject({ position: 2 }));
    expect(live.asks()).toBe(2);
  });

  it("asks the server again when the key goes up, because the key is the server's to give", async () => {
    const live = phone([
      { ...LOBBY, state: { status: "running", position: 1, itemCount: 2, reveal: false } },
      { ...LOBBY, state: { status: "running", position: 1, itemCount: 2, reveal: true } },
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
    // The socket fails before it ever subscribes, so nothing read the room.
    const opening = live.transport.resume(ME);
    await live.socket.subscribed();
    live.socket.emit("CHANNEL_ERROR");
    await expect(opening).rejects.toThrow();
    expect(live.asks()).toBe(0);

    // Realtime retries by itself and gets through. Nothing was replayed while it was down and
    // nobody has fetched the item, so coming up has to mean asking — not just tracking presence.
    live.socket.emit("SUBSCRIBED");
    await vi.waitFor(() => expect(live.recorded.views).toHaveLength(1));
    expect(live.asks()).toBe(1);
    expect(live.socket.tracked).toHaveLength(1);
    // And the caller is told it rejoined, so a screen holding a stale server render asks again.
    expect(live.recorded.connections.at(-1)).toEqual({ status: "live", rejoined: true });
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

/** A channel whose lifecycle a test drives by hand, for the statuses a fake stack never sends. */
function fakeSocket() {
  const listeners: ((status: string) => void)[] = [];
  const bindings: Record<string, string | undefined>[] = [];
  const changes: ((message: { new: Record<string, unknown> }) => void)[] = [];
  const syncs: (() => void)[] = [];
  const tracked: Record<string, unknown>[] = [];
  const order: string[] = [];
  let topic = "";
  let options: unknown = undefined;
  let channels = 0;

  const channel = {
    on(
      type: string,
      options: Record<string, string | undefined>,
      listener: (message: { new: Record<string, unknown> }) => void,
    ) {
      if (type === "presence") syncs.push(() => listener({ new: {} }));
      else {
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
    emit: (status: string) => {
      for (const listener of listeners) listener(status);
    },
    deliver: (message: { new: Record<string, unknown> }) => {
      for (const listener of changes) listener(message);
    },
    sync: () => {
      for (const listener of syncs) listener();
    },
  };
}
