import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { LiveSessionState } from "@/lib/live";
import { CONFORMANCE_ITEMS } from "@/lib/live/roomConformance";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseHost } from "./hostTransport";
import { createFakeClient } from "./testing/fakeSupabase";
import { createFakeRoom } from "./testing/supabaseRoom";

/**
 * PLAN D5: the console used to hear nothing when its channel dropped after the first open, so a
 * roster froze with no word on the screen. The channel's lifecycle is driven by hand here, for
 * the statuses a whole fake stack never sends; the realtime traffic itself is unchanged and is
 * the conformance suite's to check.
 */
function drivenHost({ failFirst = false, blocked = false } = {}) {
  const live = createFakeRoom({
    items: CONFORMANCE_ITEMS,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-0000000000d5",
  });
  const client = createFakeClient(live.stack, { role: "authenticated", orgId: live.orgId });
  const statuses: ((status: string) => void)[] = [];
  let sessionReads = 0;
  const driven = {
    ...client,
    from(...args: Parameters<typeof client.from>) {
      if (args[0] === "sessions") sessionReads += 1;
      return client.from(...args);
    },
    channel(...args: Parameters<typeof client.channel>) {
      const channel = client.channel(...args);
      const subscribe = channel.subscribe.bind(channel);
      channel.subscribe = ((callback: (status: string) => void) => {
        statuses.push(callback);
        // The first try timing out before Realtime's retry gets the channel up.
        if (failFirst || blocked) callback("TIMED_OUT");
        // A network that drops WebSockets: Realtime never gets the channel up.
        if (blocked) return channel;
        return subscribe(callback);
      }) as typeof channel.subscribe;
      return channel;
    },
  } as unknown as SupabaseClient<Database>;
  const host = createSupabaseHost({ client: driven, sessionId: live.sessionId, pollMs: 20 });
  const heard: [string, boolean][] = [];
  host.onConnection((status, rejoined) => heard.push([status, rejoined]));
  const states: LiveSessionState[] = [];
  host.onSessionState((view) => states.push(view.state));
  const emit = (status: string) => {
    for (const callback of statuses) callback(status);
  };
  return { live, host, heard, states, emit, sessionReads: () => sessionReads };
}

describe("the host console's connection", () => {
  it("says connected when the channel comes up, reconnecting when it drops, and rejoined after", async () => {
    const { live, host, heard, emit } = drivenHost();
    await host.open();
    await live.settle();
    expect(heard).toEqual([["connected", false]]);

    emit("CHANNEL_ERROR");
    emit("TIMED_OUT");
    emit("SUBSCRIBED");
    expect(heard).toEqual([
      ["connected", false],
      ["reconnecting", false],
      ["reconnecting", false],
      ["connected", true],
    ]);
    await host.close();
  });

  it("is offline when the first try fails, until the channel comes up", async () => {
    const { live, host, heard } = drivenHost({ failFirst: true });
    await host.open();
    await live.settle();
    expect(heard).toEqual([
      ["offline", false],
      ["connected", false],
    ]);
    await host.close();
  });

  it("says nothing about the close it asked for", async () => {
    const { host, heard, emit } = drivenHost();
    await host.open();
    heard.length = 0;
    await host.close();
    emit("CLOSED");
    expect(heard).toEqual([]);
  });

  it("re-reads the room when the channel comes up after a first try that failed", async () => {
    const { live, host, states, emit } = drivenHost({ blocked: true });
    await host.open();
    const other = live.host();
    await other.open();
    await other.start();
    await live.settle();
    states.length = 0;

    // The console was opened before the move, and the channel only now comes up.
    emit("SUBSCRIBED");
    await live.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(states.at(-1)).toMatchObject({ status: "running", position: 1 });
    await other.close();
    await host.close();
  });

  it("follows the room over the Data API while its channel is blocked, and stops once it is up", async () => {
    const { live, host, states, emit, sessionReads } = drivenHost({ blocked: true });
    await host.open();
    const other = live.host();
    await other.open();
    // While the channel is down, the console reads its session on a timer.
    const opened = sessionReads();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sessionReads()).toBeGreaterThanOrEqual(opened + 2);

    // Another window starts the room. No channel message reaches this console; its poll does.
    await other.start();
    await live.settle();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(states.at(-1)).toMatchObject({ status: "running", position: 1 });
    // A poll that finds the room as it was shown tells nobody.
    const told = states.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(states).toHaveLength(told);

    // Up: the channel carries the room from here, and the console stops reading it on a timer.
    emit("SUBSCRIBED");
    await live.settle();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const reads = sessionReads();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sessionReads()).toBe(reads);
    await other.close();
    await host.close();
  });
});
