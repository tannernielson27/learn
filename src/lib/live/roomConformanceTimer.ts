/**
 * The timer half of the conformance suite (#182): what every adapter owes a room with a clock on it.
 *
 * Registered by `describeRoomConformance`, so both adapters run it without being asked. Kept in a
 * file of its own because the suite it belongs to is long enough already.
 *
 * Every time here is read off the room's own clock (`room.clock()`) and moved with `room.tick()`,
 * never with wall time. Adapters whose clock steps by a millisecond per read are allowed a little
 * slack — `near` below — and nothing else is: an end time a second out is a failure.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/ngn/schemas";
import type { LiveSessionState } from "./state";
import type {
  LiveHostTransport,
  LiveSessionTransport,
  ParticipantItem,
  SessionView,
} from "./transport";
// A cycle, and a harmless one: nothing from `roomConformance` is read until the suite registers.
import {
  CONFORMANCE_CORRECT,
  CONFORMANCE_ITEMS,
  refusalOf,
  type ConformanceRoom,
} from "./roomConformance";

/** Within `slack` ms — several clock reads, never a second. */
function near(actual: number | null, expected: number, slack = 250): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(slack);
}

export function describeTimerConformance(
  adapter: string,
  makeRoom: (items?: readonly Item[]) => Promise<ConformanceRoom>,
  openHost: (room: ConformanceRoom) => Promise<LiveHostTransport>,
  joined: (room: ConformanceRoom, name: string) => Promise<LiveSessionTransport>,
): void {
  const [FIRST, SECOND] = CONFORMANCE_ITEMS as [Item, Item];

  /** A room with a 30 second timer, started, with Ada in it watching the state. */
  async function timedRoom() {
    const room = await makeRoom();
    const host = await openHost(room);
    await host.setTimer(30);
    const ada = await joined(room, "Ada");
    const seen: SessionView<ParticipantItem>[] = [];
    ada.onSessionState((view) => seen.push(view));
    const startedAt = room.clock();
    await host.start();
    await room.settle();
    return { room, host, ada, seen, startedAt };
  }

  const stateOf = (room: ConformanceRoom): Promise<LiveSessionState> => room.currentState();

  describe(`${adapter}: the item timer`, () => {
    it("starts a clock on the first item from the chosen time, and tells everyone", async () => {
      const { room, seen, startedAt } = await timedRoom();
      const state = await stateOf(room);
      expect(state.timer.seconds).toBe(30);
      expect(state.timer.remainingMs).toBeNull();
      near(state.timer.endsAt, startedAt + 30_000);
      // A participant is told the same clock the room holds, not one of its own.
      expect(seen.at(-1)?.state.timer).toEqual(state.timer);
    });

    it("takes an answer inside the grace, and refuses one after it as time_up", async () => {
      const { room, ada } = await timedRoom();
      const grace = await joined(room, "Grace");
      room.tick(31_000);
      expect((await ada.submit(FIRST.id, CONFORMANCE_CORRECT)).itemId).toBe(FIRST.id);
      room.tick(2_000);
      expect(await refusalOf(grace.submit(FIRST.id, CONFORMANCE_CORRECT))).toBe("time_up");
    });

    it("freezes on pause and restores what was left on resume", async () => {
      const { room, host, ada, seen } = await timedRoom();
      room.tick(10_000);
      await host.pause();
      await room.settle();
      const paused = await stateOf(room);
      expect(paused.timer.endsAt).toBeNull();
      near(paused.timer.remainingMs, 20_000);
      expect(seen.at(-1)?.state.timer).toEqual(paused.timer);

      room.tick(600_000);
      const resumedAt = room.clock();
      await host.resume();
      await room.settle();
      const resumed = await stateOf(room);
      expect(resumed.timer.remainingMs).toBeNull();
      near(resumed.timer.endsAt, resumedAt + (paused.timer.remainingMs as number));
      // Ten minutes paused cost the room nothing: the answer is still in time.
      expect((await ada.submit(FIRST.id, CONFORMANCE_CORRECT)).itemId).toBe(FIRST.id);
    });

    it("stops the clock at the reveal, and gives the next item the whole time", async () => {
      const { room, host } = await timedRoom();
      await host.reveal();
      await room.settle();
      expect((await stateOf(room)).timer).toEqual({
        seconds: 30,
        endsAt: null,
        remainingMs: null,
      });
      room.tick(90_000);
      const advancedAt = room.clock();
      await host.advance();
      await room.settle();
      near((await stateOf(room)).timer.endsAt, advancedAt + 30_000);
    });

    it("adds fifteen seconds, and stops the clock so answers are taken again", async () => {
      const { room, host, ada, seen, startedAt } = await timedRoom();
      await host.extendTimer();
      await room.settle();
      near((await stateOf(room)).timer.endsAt, startedAt + 45_000);
      expect(seen.at(-1)?.state.timer).toEqual((await stateOf(room)).timer);

      room.tick(120_000);
      await host.stopTimer();
      await room.settle();
      expect((await stateOf(room)).timer).toEqual({
        seconds: 30,
        endsAt: null,
        remainingMs: null,
      });
      expect((await ada.submit(FIRST.id, CONFORMANCE_CORRECT)).itemId).toBe(FIRST.id);
    });

    it("applies a new time from the next item, not to the one showing", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      await host.setTimer(60);
      await room.settle();
      expect((await stateOf(room)).timer).toEqual({
        seconds: 60,
        endsAt: null,
        remainingMs: null,
      });
      const advancedAt = room.clock();
      await host.advance();
      await room.settle();
      const state = await stateOf(room);
      near(state.timer.endsAt, advancedAt + 60_000);
      expect(state.position).toBe(2);
      const ada = await joined(room, "Ada");
      expect((await ada.submit(SECOND.id, CONFORMANCE_CORRECT)).itemId).toBe(SECOND.id);
    });

    it("refuses the timer buttons where there is no clock, and a time it does not offer", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      expect(await refusalOf(host.extendTimer())).toBe("not_started");
      await host.start();
      await room.settle();
      expect(await refusalOf(host.extendTimer())).toBe("no_timer");
      expect(await refusalOf(host.stopTimer())).toBe("no_timer");
      expect(await refusalOf(host.setTimer(45))).toBe("bad_timer");
      await host.end();
      await room.settle();
      expect(await refusalOf(host.setTimer(30))).toBe("not_open");
    });

    it("reads the session's clock, whatever the device's says", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const ada = await joined(room, "Ada");
      // Wall time passes while the test runs and a fake clock does not, hence the wider slack.
      near(host.serverNow(), room.clock(), 1_000);
      near(ada.serverNow(), room.clock(), 1_000);
    });
  });
}
