import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { CONFORMANCE_ITEMS } from "@/lib/live/roomConformance";
import type { Participant } from "@/lib/live";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseHost } from "./hostTransport";
import type { SupabaseParticipant } from "./participantTransport";
import { createFakeClient } from "./testing/fakeSupabase";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";

/**
 * #426 on the whole fake stack: the waiting screen's count reaches a phone through the session's
 * public state, kept fresh by the host's console, and a phone is sent no roster at all.
 */

interface FakeChannelLike {
  on: (type: string, filter: unknown, listener: (message: unknown) => void) => FakeChannelLike;
}

function room(): FakeRoom {
  return createFakeRoom({
    items: CONFORMANCE_ITEMS,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-000000000426",
  });
}

/** The host's console, with every call it makes to `refresh_participant_count` written down. */
function countingHost(live: FakeRoom) {
  const client = createFakeClient(live.stack, { role: "authenticated", orgId: live.orgId });
  const refreshes: unknown[] = [];
  const counted = {
    ...client,
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "refresh_participant_count") refreshes.push(args);
      return (client.rpc as unknown as (name: string, args: unknown) => unknown)(name, args);
    },
  } as unknown as SupabaseClient<Database>;
  const host = createSupabaseHost({
    client: counted,
    sessionId: live.sessionId,
    countRefreshMs: 0,
  });
  return { host, refreshes };
}

async function phoneIn(live: FakeRoom, name: string) {
  const phone = live.participant() as SupabaseParticipant;
  const counts: number[] = [];
  phone.onCount((count) => counts.push(count));
  const snapshot = await phone.join(live.code, { displayName: name });
  await live.settle();
  return { phone, counts, snapshot };
}

describe("the waiting screen's count, end to end (#426)", () => {
  it("reaches a phone a few joins later through the host's refresh, and is sent as a number", async () => {
    const live = room();
    const { host, refreshes } = countingHost(live);
    await host.open();
    await live.settle();

    const ada = await phoneIn(live, "Ada");
    expect(ada.snapshot.count).toBe(1);
    await phoneIn(live, "Grace");
    await phoneIn(live, "Quiet");

    expect(ada.counts.at(-1)).toBe(3);
    expect(refreshes).toEqual([
      { target: live.sessionId, present: 1 },
      { target: live.sessionId, present: 2 },
      { target: live.sessionId, present: 3 },
    ]);
    // What crossed the channel to a phone carries a number and no names.
    const rows = live.stack.wire.filter((entry) => entry.label === "session_public_state");
    expect(rows.at(-1)?.body).toContain('"participant_count":3');
    for (const row of rows) expect(row.body).not.toMatch(/Ada|Grace|Quiet/);
  });

  it("sends a phone no roster: no join and no leave reaches it as presence", async () => {
    const live = room();
    const { host } = countingHost(live);
    const seen: Participant[][] = [];
    host.onPresence((roster) => seen.push(roster));
    await host.open();
    await live.settle();

    const ada = await phoneIn(live, "Ada");
    const grace = await phoneIn(live, "Grace");
    await grace.phone.leave();
    await phoneIn(live, "Quiet");
    await live.settle();

    // No phone asked for presence, and none was sent any.
    expect(live.stack.presenceBindings.anon).toBe(0);
    expect(live.stack.presenceSent.anon).toBe(0);
    expect(live.stack.presenceSent.authenticated).toBeGreaterThan(0);
    // The host roster is unchanged by any of it: every join and the leave are there.
    expect(seen.at(-1)?.map((person) => person.displayName)).toEqual(["Ada", "Quiet"]);
    // And Grace leaving takes her out of the number (owner decision, 2026-10-21).
    expect(ada.counts.at(-1)).toBe(2);
  });

  it("reports a phone dropping and coming back, and ends where it started", async () => {
    const live = room();
    const { host, refreshes } = countingHost(live);
    await host.open();
    await live.settle();
    const ada = await phoneIn(live, "Ada");
    await phoneIn(live, "Grace");
    const before = refreshes.length;

    await ada.phone.leave();
    await live.settle();
    const back = live.resuming(live.stack.participants[0]!.id);
    await back.resume(live.identityOf(live.stack.participants[0]!.id));
    await live.settle();

    expect(refreshes.slice(before)).toEqual([
      { target: live.sessionId, present: 1 },
      { target: live.sessionId, present: 2 },
    ]);
    expect(live.stack.publicState[0]?.participant_count).toBe(2);
  });

  it("does not re-read the room on the host for a row that only carries a new count", async () => {
    const live = room();
    const { host } = countingHost(live);
    await host.open();
    await live.settle();
    const reads = () => live.stack.roundTrips.filter((trip) => trip === "select:sessions").length;
    const before = reads();

    await phoneIn(live, "Ada");
    await phoneIn(live, "Grace");

    expect(reads()).toBe(before);
  });

  it("writes nothing to the room when the host reports the number it already has", async () => {
    const live = room();
    await phoneIn(live, "Ada");
    const client = createFakeClient(live.stack, { role: "authenticated", orgId: live.orgId });
    await client.rpc("refresh_participant_count", { target: live.sessionId, present: 1 });
    await live.settle();
    const sent = live.stack.messagesSent;

    await client.rpc("refresh_participant_count", { target: live.sessionId, present: 1 });
    await live.settle();

    expect(live.stack.messagesSent).toBe(sent);
  });

  it("never stores more than have joined, nor less than none", async () => {
    const live = room();
    await phoneIn(live, "Ada");
    await phoneIn(live, "Grace");
    const client = createFakeClient(live.stack, { role: "authenticated", orgId: live.orgId });

    await client.rpc("refresh_participant_count", { target: live.sessionId, present: 99 });
    expect(live.stack.publicState[0]?.participant_count).toBe(2);
    await client.rpc("refresh_participant_count", { target: live.sessionId, present: -4 });
    expect(live.stack.publicState[0]?.participant_count).toBe(0);
  });

  it("still hears its own move when its own read of the room lands before the echo", async () => {
    // In production the console's read after a move usually beats the channel's echo of it. The
    // echo must still be treated as news: it is what loads the item the room moved to.
    const live = room();
    const client = createFakeClient(live.stack, { role: "authenticated", orgId: live.orgId });
    const slowEcho = {
      ...client,
      channel(topic: string, options: unknown) {
        const channel = (client.channel as unknown as (t: string, o: unknown) => FakeChannelLike)(
          topic,
          options,
        );
        const on = channel.on.bind(channel);
        channel.on = (type, filter, listener) =>
          on(type, filter, (message: unknown) => {
            setTimeout(() => listener(message), 5);
          });
        return channel;
      },
    } as unknown as SupabaseClient<Database>;
    const host = createSupabaseHost({
      client: slowEcho,
      sessionId: live.sessionId,
      countRefreshMs: 0,
    });
    const seen: (string | undefined)[] = [];
    host.onSessionState((view) => seen.push(view.item?.id));
    await host.open();
    await host.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await live.settle();
    await host.advance();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await live.settle();

    expect(seen.at(-1)).toBe(CONFORMANCE_ITEMS[1]?.id);
  });

  it("refuses a host from another org, as the database does", async () => {
    const live = room();
    const client = createFakeClient(live.stack, {
      role: "authenticated",
      orgId: "00000000-0000-0000-0000-00000000dead",
    });
    const { error } = await client.rpc("refresh_participant_count", {
      target: live.sessionId,
      present: 1,
    });
    expect(error).toMatchObject({ code: "P0002" });
  });
});
