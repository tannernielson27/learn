import { describe, expect, it, vi } from "vitest";
import type { Participant } from "@/lib/live";
import {
  COUNT_REFRESH_MS,
  COUNT_REFRESH_RETRIES,
  createCountRefresh,
  type RefreshTimers,
} from "./countRefresh";

/**
 * #426: the host's console asks the database to bring the waiting screen's count up to date. How
 * often it may ask is what bounds the messages every phone is sent for joins, so it is pinned here
 * with a clock the test moves by hand.
 */

function clock() {
  let now = 0;
  const due: { at: number; run: () => void; id: number }[] = [];
  let ids = 0;
  const timers: RefreshTimers = {
    now: () => now,
    set: (run, ms) => {
      ids += 1;
      due.push({ at: now + ms, run, id: ids });
      return ids;
    },
    clear: (id) => {
      const index = due.findIndex((timer) => timer.id === id);
      if (index !== -1) due.splice(index, 1);
    },
  };
  return {
    timers,
    pending: () => due.length,
    advance(ms: number) {
      now += ms;
      for (const timer of [...due].sort((a, b) => a.at - b.at)) {
        if (timer.at > now) continue;
        due.splice(due.indexOf(timer), 1);
        timer.run();
      }
    },
  };
}

const person = (index: number): Participant => ({
  participantId: `p-${index}`,
  displayName: `Student ${index}`,
  joinedAt: 1000 + index,
});
const roomOf = (count: number): Participant[] =>
  Array.from({ length: count }, (_, index) => person(index));

describe("createCountRefresh (#426)", () => {
  it("asks at once for the first person it sees", () => {
    const time = clock();
    const ask = vi.fn();
    const refresh = createCountRefresh(ask, COUNT_REFRESH_MS, time.timers);
    refresh.saw(roomOf(1));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks nothing for a sync that shows nobody new: a leave, a rejoin, a re-track", () => {
    const time = clock();
    const ask = vi.fn();
    const refresh = createCountRefresh(ask, COUNT_REFRESH_MS, time.timers);
    refresh.saw(roomOf(3));
    time.advance(COUNT_REFRESH_MS * 5);
    refresh.saw(roomOf(2));
    refresh.saw(roomOf(3));
    refresh.saw([person(2), person(0)]);
    time.advance(COUNT_REFRESH_MS * 5);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks at most once an interval however many join, and once more at the end of it", () => {
    const time = clock();
    const ask = vi.fn();
    const refresh = createCountRefresh(ask, COUNT_REFRESH_MS, time.timers);

    // A class arriving: a new phone every 100 ms for ten seconds.
    for (let count = 1; count <= 100; count += 1) {
      refresh.saw(roomOf(count));
      time.advance(100);
    }
    time.advance(COUNT_REFRESH_MS);

    // Ten seconds of joins, and one ask per three seconds of them plus the one that catches the
    // last arrivals: never one per join.
    expect(ask.mock.calls.length).toBeLessThanOrEqual(Math.ceil(10_000 / COUNT_REFRESH_MS) + 1);
    expect(ask.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(time.pending()).toBe(0);
  });

  it("catches the last arrival within one interval, so the count is never left behind", () => {
    const time = clock();
    const ask = vi.fn();
    const refresh = createCountRefresh(ask, COUNT_REFRESH_MS, time.timers);
    refresh.saw(roomOf(1));
    time.advance(500);
    refresh.saw(roomOf(2));
    expect(ask).toHaveBeenCalledTimes(1);

    time.advance(COUNT_REFRESH_MS - 500);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("asks nothing once it is stopped, not even what was waiting", () => {
    const time = clock();
    const ask = vi.fn();
    const refresh = createCountRefresh(ask, COUNT_REFRESH_MS, time.timers);
    refresh.saw(roomOf(1));
    refresh.saw(roomOf(2));
    refresh.stop();
    refresh.saw(roomOf(3));
    time.advance(COUNT_REFRESH_MS * 2);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(time.pending()).toBe(0);
  });

  it("asks once more an interval later when an ask fails, and gives up after a few", async () => {
    const time = clock();
    const ask = vi.fn(async () => false);
    const refresh = createCountRefresh(ask, COUNT_REFRESH_MS, time.timers);
    refresh.saw(roomOf(1));
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve();
      await Promise.resolve();
      time.advance(COUNT_REFRESH_MS);
    }
    expect(ask).toHaveBeenCalledTimes(1 + COUNT_REFRESH_RETRIES);
    expect(time.pending()).toBe(0);
  });

  it("does not ask again after an ask that went through", async () => {
    const time = clock();
    const ask = vi.fn(async () => true);
    const refresh = createCountRefresh(ask, COUNT_REFRESH_MS, time.timers);
    refresh.saw(roomOf(1));
    await Promise.resolve();
    time.advance(COUNT_REFRESH_MS * 3);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks for every newcomer at once when the interval is zero", () => {
    const time = clock();
    const ask = vi.fn();
    const refresh = createCountRefresh(ask, 0, time.timers);
    refresh.saw(roomOf(1));
    refresh.saw(roomOf(2));
    refresh.saw(roomOf(3));
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it("uses a few seconds by default: within the issue's 'a few seconds of a join'", () => {
    expect(COUNT_REFRESH_MS).toBeGreaterThanOrEqual(1000);
    expect(COUNT_REFRESH_MS).toBeLessThanOrEqual(5000);
  });

  it("runs on the real timers when none are given", () => {
    vi.useFakeTimers();
    try {
      const ask = vi.fn();
      const refresh = createCountRefresh(ask);
      refresh.saw(roomOf(1));
      refresh.saw(roomOf(2));
      expect(ask).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(COUNT_REFRESH_MS);
      expect(ask).toHaveBeenCalledTimes(2);
      refresh.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
