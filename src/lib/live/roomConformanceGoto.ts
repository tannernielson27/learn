/**
 * The goto half of the conformance suite (#183): what every adapter owes a host who skips an item
 * or goes back to one.
 *
 * Registered by `describeRoomConformance`, so both adapters run it without being asked. The rules
 * are `goToItem` in `state.ts`; what this adds is that an adapter keeps them end to end — the room
 * moves, both sides hear, answers already given stay given, and the tally for the item left is
 * pushed once, exactly as `advance` does.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/ngn/schemas";
import type {
  ItemAggregate,
  ItemReveal,
  LiveHostTransport,
  LiveSessionTransport,
  ParticipantItem,
  SessionView,
} from "./transport";
// A cycle, and a harmless one: nothing from `roomConformance` is read until the suite registers.
import {
  CONFORMANCE_CORRECT,
  CONFORMANCE_ITEMS,
  CONFORMANCE_WRONG,
  refusalOf,
  type ConformanceRoom,
} from "./roomConformance";

/** Within `slack` ms of `expected`. See `roomConformanceTimer.ts`. */
function near(actual: number | null, expected: number, slack = 250): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(slack);
}

export function describeGotoConformance(
  adapter: string,
  makeRoom: (items?: readonly Item[]) => Promise<ConformanceRoom>,
  openHost: (room: ConformanceRoom) => Promise<LiveHostTransport>,
  joined: (room: ConformanceRoom, name: string) => Promise<LiveSessionTransport>,
): void {
  const [FIRST, , THIRD] = CONFORMANCE_ITEMS as [Item, Item, Item];

  describe(`${adapter}: going to an item`, () => {
    it("jumps forwards and back, and both sides hear about it", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const hostViews: SessionView<Item>[] = [];
      host.onSessionState((view) => hostViews.push(view));
      const ada = await joined(room, "Ada");
      const adaViews: SessionView<ParticipantItem>[] = [];
      ada.onSessionState((view) => adaViews.push(view));

      await host.start();
      expect((await host.goto(3)).position).toBe(3);
      await room.settle();
      expect(hostViews.at(-1)?.item?.id).toBe(THIRD.id);
      expect(adaViews.at(-1)?.item?.id).toBe(THIRD.id);

      expect((await host.goto(1)).position).toBe(1);
      await room.settle();
      await expect(room.currentState()).resolves.toMatchObject({
        status: "running",
        position: 1,
        reveal: false,
      });
      expect(hostViews.at(-1)?.item?.id).toBe(FIRST.id);
      expect(adaViews.at(-1)?.item?.id).toBe(FIRST.id);
      // The participant's copy is still keyless on the way back.
      expect(adaViews.at(-1)?.item).not.toHaveProperty("answerKey");
    });

    it("refuses the lobby, a position the set does not have, the item it is on, and an ended room", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      expect(await refusalOf(host.goto(2))).toBe("not_started");
      await host.start();
      await room.settle();
      expect(await refusalOf(host.goto(0))).toBe("out_of_range");
      expect(await refusalOf(host.goto(CONFORMANCE_ITEMS.length + 1))).toBe("out_of_range");
      expect(await refusalOf(host.goto(1))).toBe("same_item");
      await host.end();
      await room.settle();
      expect(await refusalOf(host.goto(2))).toBe("not_open");
      // Nothing that was refused moved the room.
      await expect(room.currentState()).resolves.toMatchObject({ status: "ended", position: 1 });
    });

    it("keeps a paused room paused, and clears a reveal on the way", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      await host.reveal();
      await host.pause();
      await host.goto(3);
      await room.settle();
      await expect(room.currentState()).resolves.toMatchObject({
        status: "paused",
        position: 3,
        reveal: false,
      });
    });

    it("keeps the answers already given, so going back shows that item as it was", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await room.settle();

      await host.goto(3);
      await host.goto(1);
      await room.settle();
      expect(await host.aggregate()).toMatchObject({
        itemId: FIRST.id,
        position: 1,
        responded: 1,
        fullMarks: 1,
      });
      // One answer per person per item: Ada's stands, and Grace may still give hers.
      expect(await refusalOf(ada.submit(FIRST.id, CONFORMANCE_WRONG))).toBe("already_answered");
      expect((await grace.submit(FIRST.id, CONFORMANCE_WRONG)).itemId).toBe(FIRST.id);
      await room.settle();
      expect(await host.aggregate()).toMatchObject({ position: 1, responded: 2, noMarks: 1 });
    });

    it("reveals the item gone back to with each participant's own earlier marks", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const reveals: ItemReveal[] = [];
      ada.onReveal((revealed) => reveals.push(revealed));
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await host.goto(2);
      await host.goto(1);
      await host.reveal();
      await room.settle();
      expect(reveals.at(-1)).toMatchObject({ itemId: FIRST.id, position: 1 });
      expect(reveals.at(-1)?.score?.points).toBe(1);
    });

    it("pushes the tally for the item it left, once, like advance", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const seen: ItemAggregate[] = [];
      host.onAggregate((aggregate) => seen.push(aggregate));
      await host.start();
      const ada = await joined(room, "Ada");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await host.goto(3);
      await room.settle();
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ position: 1, responded: 1 });
    });

    it("gives the item jumped to the whole chosen time", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.setTimer(30);
      await host.start();
      await room.settle();
      room.tick(20_000);
      const jumpedAt = room.clock();
      await host.goto(3);
      await room.settle();
      near((await room.currentState()).timer.endsAt, jumpedAt + 30_000);
    });
  });
}
