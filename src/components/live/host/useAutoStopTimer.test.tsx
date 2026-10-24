import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyHostCommand,
  goToItem,
  initialSessionState,
  type LiveSessionState,
  type SessionProgress,
} from "@/lib/live";
import { AUTO_STOP_SETTLE_MS } from "@/lib/live/autoStop";
import type { RosterEntry } from "@/lib/live/roster";
import type { ProgressRead } from "@/components/live/control/useProgressRead";
import { useAutoStopTimer, type AutoStopRoom } from "./useAutoStopTimer";

const NOW = 1_800_000_000_000;

function started(): LiveSessionState {
  const moved = applyHostCommand(initialSessionState(2, 60), "start", NOW);
  if (!moved.ok) throw new Error(moved.message);
  return moved.state;
}

function goTo(state: LiveSessionState, position: number): LiveSessionState {
  const moved = goToItem(state, position, Date.now());
  if (!moved.ok) throw new Error(moved.message);
  return moved.state;
}

const person = (n: number, present = true): RosterEntry => ({
  participantId: `p${n}`,
  displayName: `Student ${n}`,
  joinedAt: NOW + n,
  present,
});

/** A progress read for `position`, in which participants `who` have answered it. */
const read = (who: number[], position = 1, also: number[] = []): ProgressRead => {
  const ids = new Set([...who, ...also]);
  const progress: SessionProgress = {
    answered: [],
    rows: [...ids].map((n) => ({
      participantId: `p${n}`,
      displayName: `Student ${n}`,
      positions: who.includes(n) ? [position] : [],
    })),
  };
  return { position, progress };
};

interface Props {
  value: AutoStopRoom;
  progress: ProgressRead | null;
  on: boolean;
}

function setup(room: Partial<AutoStopRoom>, progress: ProgressRead | null = read([1, 2])) {
  const stopQuietly = vi.fn(async () => true);
  const base: AutoStopRoom = {
    state: started(),
    roster: [person(1), person(2)],
    serverNow: () => Date.now(),
    stopQuietly,
    ...room,
  };
  const hook = renderHook(
    ({ value, progress: held, on }: Props) => useAutoStopTimer(value, held, on),
    { initialProps: { value: base, progress, on: true } },
  );
  const rerender = (props: Partial<Props>) =>
    hook.rerender({ value: base, progress, on: true, ...props });
  return { ...hook, rerender, base, stopQuietly };
}

async function wait(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
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
    const { result, stopQuietly, rerender } = setup({});
    expect(stopQuietly).not.toHaveBeenCalled();

    await wait(AUTO_STOP_SETTLE_MS - 1);
    expect(stopQuietly).not.toHaveBeenCalled();

    await wait(1);
    expect(stopQuietly).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(1);

    // New reads and presence syncs keep arriving while the stop lands: still once.
    rerender({ progress: read([1, 2]) });
    await wait(10_000);
    expect(stopQuietly).toHaveBeenCalledTimes(1);
  });

  it("does not fire while a connected student is still thinking, however many answered then left", async () => {
    // The reviewer's case, scaled down: 6 joined; 2 answered and then dropped out of presence
    // (locked screens); 2 connected students answered, 2 connected students have not. Counting
    // answers (4) against phones connected now (4) would have ended the timer on them.
    const roster = [person(1), person(2), person(3), person(4), person(5, false), person(6, false)];
    const { stopQuietly } = setup({ roster }, read([1, 2, 5, 6]));
    await wait(30_000);
    expect(stopQuietly).not.toHaveBeenCalled();
  });

  it("fires after the settle window once everyone has answered, away phones included", async () => {
    const roster = [person(1), person(2), person(3, false)];
    const { stopQuietly } = setup({ roster }, read([1, 2, 3]));
    await wait(AUTO_STOP_SETTLE_MS - 1);
    expect(stopQuietly).not.toHaveBeenCalled();
    await wait(1);
    expect(stopQuietly).toHaveBeenCalledTimes(1);
  });

  it("never fires while an away student has not answered", async () => {
    const roster = [person(1), person(2), person(3, false)];
    const { stopQuietly } = setup({ roster }, read([1, 2]));
    await wait(30_000);
    expect(stopQuietly).not.toHaveBeenCalled();
  });

  it("never fires while someone the read says joined, but presence never saw, has not answered", async () => {
    // A phone on the HTTP fallback never tracks presence: it is in the read, not the roster.
    const { stopQuietly } = setup({}, read([1, 2], 1, [3]));
    await wait(30_000);
    expect(stopQuietly).not.toHaveBeenCalled();
  });

  it("never fires with an empty roster", async () => {
    const { stopQuietly } = setup({ roster: [] }, read([1, 2]));
    await wait(30_000);
    expect(stopQuietly).not.toHaveBeenCalled();
  });

  it("never fires before this question's progress has been read", async () => {
    const { stopQuietly, rerender } = setup({}, null);
    await wait(30_000);
    expect(stopQuietly).not.toHaveBeenCalled();

    // A read about another question does not count either.
    rerender({ progress: read([1, 2], 2) });
    await wait(30_000);
    expect(stopQuietly).not.toHaveBeenCalled();
  });

  it("cancels when a phone joins inside the window, and waits again once it answers", async () => {
    const { stopQuietly, rerender, base } = setup({});
    await wait(1_000);
    const three = [person(1), person(2), person(3)];
    rerender({ value: { ...base, roster: three } });
    await wait(5_000);
    expect(stopQuietly).not.toHaveBeenCalled();

    rerender({ value: { ...base, roster: three }, progress: read([1, 2, 3]) });
    await wait(AUTO_STOP_SETTLE_MS);
    expect(stopQuietly).toHaveBeenCalledTimes(1);
  });

  it("returning to an earlier question: the earlier visit cannot fire it", async () => {
    const { stopQuietly, rerender, base } = setup({}, read([1]));
    await wait(5_000);
    expect(stopQuietly).not.toHaveBeenCalled();

    const second = goTo(base.state, 2);
    rerender({ value: { ...base, state: second }, progress: null });
    await wait(5_000);
    const back = goTo(second, 1);
    // Back on question 1 with no read for this visit yet: nothing, however long.
    rerender({ value: { ...base, state: back }, progress: null });
    await wait(30_000);
    expect(stopQuietly).not.toHaveBeenCalled();

    // This visit's own read: everyone has answered question 1 now.
    rerender({ value: { ...base, state: back }, progress: read([1, 2]) });
    await wait(AUTO_STOP_SETTLE_MS);
    expect(stopQuietly).toHaveBeenCalledTimes(1);
  });

  it("does nothing with the setting off", async () => {
    const { stopQuietly, result, rerender } = setup({});
    rerender({ on: false });
    await wait(10_000);
    expect(stopQuietly).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("shows nothing when the stop did not go through", async () => {
    const refused = vi.fn(async () => false);
    const { result } = setup({ stopQuietly: refused });
    await wait(AUTO_STOP_SETTLE_MS);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });
});
