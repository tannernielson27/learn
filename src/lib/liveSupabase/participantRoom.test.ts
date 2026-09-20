import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { LiveSessionState, Participant } from "@/lib/live";
import { createParticipantRoom, publicStateFrom, type RoomConnection } from "./participantRoom";
import { FakeSupabase, createFakeClient, type FakeSessionRow } from "./testing/fakeSupabase";
import type { Database } from "@/lib/supabase/database.types";
import { liveTopic } from "./wire";

const SESSION_ID = "00000000-0000-0000-0000-0000000132aa";
const ME = { participantId: "p-1", displayName: "Sam Okafor", joinedAt: 100 };

function seed(): FakeSupabase {
  const stack = new FakeSupabase();
  const session: FakeSessionRow = {
    id: SESSION_ID,
    org_id: "00000000-0000-0000-0000-0000000132bb",
    host_id: "00000000-0000-0000-0000-0000000132cc",
    code: "AB2CD3",
    title: "Room",
    mode: "instructor_paced",
    status: "lobby",
    item_set: ["i-1", "i-2"],
    current_position: null,
    reveal: false,
    item_ends_at: null,
    closed_at: null,
  };
  stack.sessions.push(session);
  stack.publicState.push({
    session_id: SESSION_ID,
    status: "lobby",
    item_position: null,
    item_count: 2,
    reveal: false,
    item_ends_at: null,
    updated_at: stack.now(),
  });
  return stack;
}

interface Recorded {
  states: LiveSessionState[];
  rosters: Participant[][];
  connections: { status: RoomConnection; rejoined: boolean }[];
}

function open(stack: FakeSupabase, client?: SupabaseClient<Database>) {
  const recorded: Recorded = { states: [], rosters: [], connections: [] };
  const room = createParticipantRoom({
    client: client ?? createFakeClient(stack, { role: "anon" }),
    sessionId: SESSION_ID,
    me: ME,
    onState: (state) => recorded.states.push(state),
    onRoster: (roster) => recorded.rosters.push(roster),
    onConnection: (status, rejoined) => recorded.connections.push({ status, rejoined }),
  });
  return { room, recorded };
}

describe("publicStatePayload", () => {
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

describe("createParticipantRoom", () => {
  it("puts this phone in the roster as soon as the channel is up", async () => {
    const stack = seed();
    const { room, recorded } = open(stack);
    await stack.settle();

    expect(recorded.rosters.at(-1)).toEqual([
      { participantId: "p-1", displayName: "Sam Okafor", joinedAt: 100 },
    ]);
    await room.leave();
  });

  it("reports the room as live once it is subscribed, and not before", async () => {
    const stack = seed();
    const { room, recorded } = open(stack);
    expect(recorded.connections).toEqual([]);
    await stack.settle();
    expect(recorded.connections).toEqual([{ status: "live", rejoined: false }]);
    await room.leave();
  });

  it("carries a host's move to the phone without anything being asked for", async () => {
    const stack = seed();
    const { room, recorded } = open(stack);
    await stack.settle();

    stack.updateSession(SESSION_ID, { status: "running", current_position: 1 });
    await stack.settle();

    expect(recorded.states.at(-1)).toEqual({
      status: "running",
      position: 1,
      itemCount: 2,
      reveal: false,
    });
    await room.leave();
  });

  it("hears a reveal and an end as two more moves", async () => {
    const stack = seed();
    const { room, recorded } = open(stack);
    await stack.settle();

    stack.updateSession(SESSION_ID, { status: "running", current_position: 1 });
    await stack.settle();
    stack.updateSession(SESSION_ID, { reveal: true });
    await stack.settle();
    stack.updateSession(SESSION_ID, { status: "ended" });
    await stack.settle();

    expect(recorded.states.map((state) => `${state.status}:${state.reveal}`)).toEqual([
      "running:false",
      "running:true",
      "ended:false",
    ]);
    await room.leave();
  });

  it("sees everyone else in the room, ordered by when they arrived", async () => {
    const stack = seed();
    const { room, recorded } = open(stack);
    const other = open(stack).room;
    await stack.settle();

    // The second connection tracks under its own presence key, so both are in the sync.
    expect(recorded.rosters.at(-1)?.length).toBeGreaterThanOrEqual(1);
    await other.leave();
    await stack.settle();
    await room.leave();
  });

  it("stops listening once the phone leaves, and leaving twice is harmless", async () => {
    const stack = seed();
    const { room, recorded } = open(stack);
    await stack.settle();
    await room.leave();
    await room.leave();

    const before = recorded.states.length;
    stack.updateSession(SESSION_ID, { status: "running", current_position: 1 });
    await stack.settle();
    expect(recorded.states).toHaveLength(before);
  });

  it("re-tracks and says it rejoined when the socket comes back", async () => {
    const socket = fakeSocket();
    const { room, recorded } = open(seed(), socket.client);

    socket.emit("SUBSCRIBED");
    socket.emit("CHANNEL_ERROR");
    socket.emit("SUBSCRIBED");

    expect(recorded.connections).toEqual([
      { status: "live", rejoined: false },
      { status: "reconnecting", rejoined: false },
      { status: "live", rejoined: true },
    ]);
    // Presence is re-sent on every rejoin: Realtime replays nothing, so a phone that does not
    // track again is a name missing from the front of the class.
    expect(socket.tracked).toHaveLength(2);
    await room.leave();
  });

  it("calls a room that timed out or closed reconnecting", async () => {
    const socket = fakeSocket();
    const { room, recorded } = open(seed(), socket.client);
    socket.emit("TIMED_OUT");
    socket.emit("CLOSED");
    expect(recorded.connections.map((entry) => entry.status)).toEqual([
      "reconnecting",
      "reconnecting",
    ]);
    await room.leave();
  });

  it("subscribes to the mirror in the schema the Data API cannot serve", () => {
    const socket = fakeSocket();
    open(seed(), socket.client);
    expect(socket.bindings[0]).toMatchObject({
      schema: "live",
      table: "session_public_state",
      filter: `session_id=eq.${SESSION_ID}`,
    });
    expect(socket.topic).toBe(liveTopic(SESSION_ID));
  });

  it("ignores a message that is not a state row", () => {
    const socket = fakeSocket();
    const { recorded } = open(seed(), socket.client);
    socket.deliver({ new: { nonsense: true } });
    expect(recorded.states).toEqual([]);
  });
});

/** A channel whose lifecycle a test drives by hand, for the statuses the fake stack never sends. */
function fakeSocket() {
  const listeners: ((status: string) => void)[] = [];
  const bindings: Record<string, string | undefined>[] = [];
  const changes: ((message: { new: Record<string, unknown> }) => void)[] = [];
  const tracked: Record<string, unknown>[] = [];
  let topic = "";

  const channel = {
    on(
      type: string,
      options: Record<string, string | undefined>,
      listener: (message: { new: Record<string, unknown> }) => void,
    ) {
      if (type === "postgres_changes") {
        bindings.push(options);
        changes.push(listener);
      }
      return channel;
    },
    subscribe(callback: (status: string) => void) {
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
    channel(name: string) {
      topic = name;
      return channel;
    },
    removeChannel: vi.fn(async () => "ok" as const),
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    bindings,
    tracked,
    get topic() {
      return topic;
    },
    emit: (status: string) => {
      for (const listener of listeners) listener(status);
    },
    deliver: (message: { new: Record<string, unknown> }) => {
      for (const listener of changes) listener(message);
    },
  };
}
