/**
 * The results half of the conformance suite (#180): how a room answered the item it is on, as the
 * host console draws it.
 *
 * Registered by `describeRoomConformance`, so both adapters run it without being asked. The
 * distribution itself is `distributionFor`'s (#179) and tested there; what is pinned here is that
 * each adapter feeds it the stored answers for the right item, asks nothing of the channel, and
 * gives a participant no way to it at all.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/ngn/schemas";
import type { ItemAggregate, LiveHostTransport, LiveSessionTransport } from "./transport";
// A cycle, and a harmless one: nothing from `roomConformance` is read until the suite registers.
import {
  CONFORMANCE_CORRECT,
  CONFORMANCE_ITEMS,
  CONFORMANCE_WRONG,
  type ConformanceRoom,
} from "./roomConformance";

export function describeResultsConformance(
  adapter: string,
  makeRoom: (items?: readonly Item[]) => Promise<ConformanceRoom>,
  openHost: (room: ConformanceRoom) => Promise<LiveHostTransport>,
  joined: (room: ConformanceRoom, name: string) => Promise<LiveSessionTransport>,
): void {
  const [FIRST, SECOND] = CONFORMANCE_ITEMS as [Item, Item];

  describe(`${adapter}: results`, () => {
    it("are null when the room is on no item, however it got there", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      expect(await host.results()).toBeNull();
      await host.start();
      await room.settle();
      expect(await host.results()).not.toBeNull();
      await host.end();
      await room.settle();
      expect(await host.results()).toBeNull();
    });

    it("count which choice each answer picked, for the item the room is on", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      await room.settle();
      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");
      const bo = await joined(room, "Bo");

      expect(await host.results()).toMatchObject({
        itemId: FIRST.id,
        kind: "options",
        responded: 0,
      });

      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await grace.submit(FIRST.id, CONFORMANCE_CORRECT);
      await bo.submit(FIRST.id, CONFORMANCE_WRONG);
      await room.settle();

      const results = await host.results();
      expect(results).toMatchObject({ itemId: FIRST.id, kind: "options", responded: 3 });
      const options = results?.kind === "options" ? results.options : [];
      expect(options.find((option) => option.id === "opt_a")).toMatchObject({
        count: 2,
        correct: true,
      });
      expect(options.find((option) => option.id === "opt_c")).toMatchObject({
        count: 1,
        correct: false,
      });
    });

    it("start again from nothing on the next item", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      await room.settle();
      const ada = await joined(room, "Ada");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await room.settle();
      await host.advance();
      await room.settle();
      expect(await host.results()).toMatchObject({ itemId: SECOND.id, responded: 0 });
    });

    it("are asked for, never pushed: counting them sends the console nothing", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const seen: ItemAggregate[] = [];
      host.onAggregate((aggregate) => seen.push(aggregate));
      await host.start();
      await room.settle();
      const ada = await joined(room, "Ada");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await room.settle();
      await host.results();
      await host.results();
      await room.settle();
      expect(seen).toHaveLength(0);
    });

    it("are not something a participant connection can ask for", async () => {
      const room = await makeRoom();
      const participant = room.participant();
      expect(participant).not.toHaveProperty("results");
      expect(participant).not.toHaveProperty("aggregate");
    });
  });
}
