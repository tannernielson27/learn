/**
 * The student-paced half of the conformance suite (#185): what every adapter owes a room that is
 * opened on its whole set, where each phone works through the items at its own pace and the host
 * shows every answer at once.
 *
 * Registered by `describeRoomConformance`, so both adapters run it without being asked. The rules
 * are `state.ts`'s (`isStudentPaced`, `canSubmit`, `pacedSet`); what this adds is that an adapter
 * keeps them end to end — the set reaches a phone without a key, answers land at the position of
 * the item answered in whatever order the phones go, the board counts answered-or-not and never a
 * mark, and "Show answers" hands each phone every item's key with its own marks where it answered.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { describe, expect, it } from "vitest";
import type { AnyResponse, Item } from "@/lib/ngn/schemas";
import type { SessionMode } from "./state";
import type {
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

/** The third conformance item's key, a select-all-that-apply. */
const THIRD_CORRECT: AnyResponse = {
  type: "multiple_response",
  optionIds: ["opt_a", "opt_b", "opt_d"],
};

export function describePacedConformance(
  adapter: string,
  makeRoom: (items?: readonly Item[], mode?: SessionMode) => Promise<ConformanceRoom>,
  openHost: (room: ConformanceRoom) => Promise<LiveHostTransport>,
  joined: (room: ConformanceRoom, name: string) => Promise<LiveSessionTransport>,
): void {
  const [FIRST, SECOND, THIRD] = CONFORMANCE_ITEMS as [Item, Item, Item];
  const ids = CONFORMANCE_ITEMS.map((item) => item.id);
  const paced = () => makeRoom(CONFORMANCE_ITEMS, "student_paced");

  describe(`${adapter}: a student-paced room`, () => {
    it("hands every phone the whole set, keyless, once it starts, and no single item", async () => {
      const room = await paced();
      expect(room.mode).toBe("student_paced");
      const host = await openHost(room);
      const ada = await joined(room, "Ada");
      const views: SessionView<ParticipantItem>[] = [];
      ada.onSessionState((view) => views.push(view));

      await host.start();
      await room.settle();
      const view = views.at(-1);
      expect(view?.state).toMatchObject({ status: "running", mode: "student_paced" });
      expect(view?.item).toBeNull();
      expect(view?.set?.map((item) => item.id)).toEqual(ids);
      for (const item of view?.set ?? []) {
        expect(item).not.toHaveProperty("answerKey");
        expect(item).not.toHaveProperty("rationale");
        expect(item).not.toHaveProperty("scoring");
      }
      await expect(room.currentState()).resolves.toMatchObject({ mode: "student_paced" });
    });

    it("refuses next item, a jump and the timer, and moves nothing for it", async () => {
      const room = await paced();
      const host = await openHost(room);
      expect(await refusalOf(host.setTimer(30))).toBe("student_paced");
      await host.start();
      await room.settle();
      expect(await refusalOf(host.advance())).toBe("student_paced");
      expect(await refusalOf(host.goto(2))).toBe("student_paced");
      expect(await refusalOf(host.extendTimer())).toBe("student_paced");
      expect(await refusalOf(host.stopTimer())).toBe("student_paced");
      await expect(room.currentState()).resolves.toMatchObject({
        status: "running",
        position: 1,
        reveal: false,
        timer: { seconds: null, endsAt: null, remainingMs: null },
      });
    });

    it("takes answers to any item in any order, once each, while running", async () => {
      const room = await paced();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");

      expect((await ada.submit(THIRD.id, THIRD_CORRECT)).itemId).toBe(THIRD.id);
      expect((await ada.submit(FIRST.id, CONFORMANCE_CORRECT)).itemId).toBe(FIRST.id);
      expect((await grace.submit(SECOND.id, CONFORMANCE_WRONG)).itemId).toBe(SECOND.id);
      expect(await refusalOf(ada.submit(THIRD.id, THIRD_CORRECT))).toBe("already_answered");
      expect(await refusalOf(ada.submit("not_in_this_set", CONFORMANCE_CORRECT))).toBe(
        "wrong_item",
      );

      await host.pause();
      await room.settle();
      expect(await refusalOf(grace.submit(FIRST.id, CONFORMANCE_CORRECT))).toBe("paused");
      await host.resume();
      await room.settle();
      expect((await grace.submit(FIRST.id, CONFORMANCE_CORRECT)).itemId).toBe(FIRST.id);

      await host.reveal();
      await room.settle();
      expect(await refusalOf(grace.submit(THIRD.id, THIRD_CORRECT))).toBe("already_revealed");
      await host.end();
      await room.settle();
      expect(await refusalOf(ada.submit(SECOND.id, CONFORMANCE_CORRECT))).toBe("not_open");
    });

    it("counts who answered what for the board, and nothing about how well", async () => {
      const room = await paced();
      const host = await openHost(room);
      expect(await host.progress()).toBeNull();
      await host.start();
      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");
      await joined(room, "Linus");
      await ada.submit(THIRD.id, THIRD_CORRECT);
      await ada.submit(FIRST.id, CONFORMANCE_WRONG);
      await grace.submit(FIRST.id, CONFORMANCE_CORRECT);
      await room.settle();

      const progress = await host.progress();
      expect(progress?.answered).toEqual([2, 0, 1]);
      expect(progress?.rows.map((row) => [row.displayName, row.positions])).toEqual([
        ["Ada", [1, 3]],
        ["Grace", [1]],
        ["Linus", []],
      ]);
      // Answered or not, and no more: a mark on a projected board is a hint.
      for (const row of progress?.rows ?? []) {
        expect(Object.keys(row).sort()).toEqual(["displayName", "participantId", "positions"]);
      }
      expect(JSON.stringify(progress)).not.toMatch(/points|marks|response|answerKey/i);
      // No single item, so no tally and no results for one.
      expect(await host.aggregate()).toBeNull();
      expect(await host.results()).toBeNull();
    });

    it("shows every item's answer at once, with each phone's own marks where it answered", async () => {
      const room = await paced();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const reveals: ItemReveal[] = [];
      ada.onReveal((revealed) => reveals.push(revealed));
      await ada.submit(SECOND.id, CONFORMANCE_WRONG);
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await room.settle();
      expect(reveals).toHaveLength(0);

      await host.reveal();
      await room.settle();
      const byPosition = [...reveals].sort((a, b) => a.position - b.position);
      expect(byPosition.map((revealed) => [revealed.position, revealed.itemId])).toEqual([
        [1, FIRST.id],
        [2, SECOND.id],
        [3, THIRD.id],
      ]);
      expect(byPosition[0]?.score?.points).toBe(1);
      expect(byPosition[1]?.score?.points).toBe(0);
      // Not answered: the key all the same, with no marks.
      expect(byPosition[2]?.score).toBeNull();
      expect(byPosition[2]?.reveal.answerKey).toEqual(THIRD.answerKey);
      await expect(room.currentState()).resolves.toMatchObject({ reveal: true, position: 1 });
    });

    it("keeps the set off a phone once the room has ended", async () => {
      const room = await paced();
      const host = await openHost(room);
      const ada = await joined(room, "Ada");
      const views: SessionView<ParticipantItem>[] = [];
      ada.onSessionState((view) => views.push(view));
      await host.start();
      await host.end();
      await room.settle();
      expect(views.at(-1)?.state.status).toBe("ended");
      expect(views.at(-1)?.set).toBeUndefined();
      expect(views.at(-1)?.item).toBeNull();
    });
  });
}
