import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
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
function drivenHost({ failFirst = false } = {}) {
  const live = createFakeRoom({
    items: CONFORMANCE_ITEMS,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-0000000000d5",
  });
  const client = createFakeClient(live.stack, { role: "authenticated", orgId: live.orgId });
  const statuses: ((status: string) => void)[] = [];
  const driven = {
    ...client,
    channel(...args: Parameters<typeof client.channel>) {
      const channel = client.channel(...args);
      const subscribe = channel.subscribe.bind(channel);
      channel.subscribe = ((callback: (status: string) => void) => {
        statuses.push(callback);
        // The first try timing out before Realtime's retry gets the channel up.
        if (failFirst) callback("TIMED_OUT");
        return subscribe(callback);
      }) as typeof channel.subscribe;
      return channel;
    },
  } as unknown as SupabaseClient<Database>;
  const host = createSupabaseHost({ client: driven, sessionId: live.sessionId });
  const heard: [string, boolean][] = [];
  host.onConnection((status, rejoined) => heard.push([status, rejoined]));
  const emit = (status: string) => {
    for (const callback of statuses) callback(status);
  };
  return { live, host, heard, emit };
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
});
