import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyHostCommand,
  initialSessionState,
  type ItemAggregate,
  type LiveSessionState,
} from "@/lib/live";
import { AUTO_STOP_SETTLE_MS } from "@/lib/live/autoStop";
import type { RosterEntry } from "@/lib/live/roster";
import { useAutoStopTimer, type AutoStopRoom } from "./useAutoStopTimer";

const NOW = 1_800_000_000_000;

function started(): LiveSessionState {
  const moved = applyHostCommand(initialSessionState(2, 60), "start", NOW);
  if (!moved.ok) throw new Error(moved.message);
  return moved.state;
}

const person = (n: number, present = true): RosterEntry => ({
  participantId: `p${n}`,
  displayName: `Student ${n}`,
  joinedAt: NOW + n,
  present,
});

const tally = (responded: number, position = 1): ItemAggregate => ({
  itemId: `item-${position}`,
  position,
  present: responded,
  responded,
  fullMarks: 0,
  partialMarks: 0,
  noMarks: 0,
  meanPoints: 0,
  maxPoints: 1,
});

function setup(room: Partial<AutoStopRoom>, enabled = true) {
  const stopQuietly = vi.fn(async () => true);
  const base: AutoStopRoom = {
    state: started(),
    tally: tally(2),
    roster: [person(1), person(2)],
    serverNow: () => Date.now(),
    stopQuietly,
    ...room,
  };
  const hook = renderHook(
    ({ value, on }: { value: AutoStopRoom; on: boolean }) => useAutoStopTimer(value, on),
    { initialProps: { value: base, on: enabled } },
  );
  return { ...hook, base, stopQuietly };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW + 5_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoStopTimer", () => {
  it("sends stop_timer once, after the settle window, and reports the question it ended", async () => {
    const { result, stopQuietly, rerender, base } = setup({});
    expect(stopQuietly).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(AUTO_STOP_SETTLE_MS - 1);
    });
    expect(stopQuietly).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(stopQuietly).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(1);

    // New tallies and presence syncs keep arriving while the stop lands: still once.
    rerender({ value: { ...base, tally: tally(2), roster: [person(1), person(2)] }, on: true });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(stopQuietly).toHaveBeenCalledTimes(1);
  });

  it("cancels when a phone joins inside the window, and waits again once it answers", async () => {
    const { stopQuietly, rerender, base } = setup({});
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    rerender({ value: { ...base, roster: [person(1), person(2), person(3)] }, on: true });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(stopQuietly).not.toHaveBeenCalled();

    rerender({
      value: { ...base, roster: [person(1), person(2), person(3)], tally: tally(3) },
      on: true,
    });
    await act(async () => {
      vi.advanceTimersByTime(AUTO_STOP_SETTLE_MS);
    });
    expect(stopQuietly).toHaveBeenCalledTimes(1);
  });

  it("does nothing with the setting off", async () => {
    const { stopQuietly, result } = setup({}, false);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(stopQuietly).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("counts only phones that are present, not names that have gone away", async () => {
    const { stopQuietly } = setup({ roster: [person(1), person(2), person(3, false)] });
    await act(async () => {
      vi.advanceTimersByTime(AUTO_STOP_SETTLE_MS);
    });
    expect(stopQuietly).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when the stop did not go through", async () => {
    const refused = vi.fn(async () => false);
    const { result } = setup({ stopQuietly: refused });
    await act(async () => {
      vi.advanceTimersByTime(AUTO_STOP_SETTLE_MS);
    });
    expect(refused).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });
});
