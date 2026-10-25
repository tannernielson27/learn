import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionProgress } from "@/lib/live";
import { useProgressRead } from "./useProgressRead";

const answeredBy = (position: number): SessionProgress => ({
  answered: [],
  rows: [{ participantId: "p1", displayName: "Ada", positions: [position] }],
});

function setup(ask: () => Promise<SessionProgress | null>) {
  return renderHook(
    ({ position, active }: { position: number | null; active: boolean }) =>
      useProgressRead(ask, position, active, 1_000),
    { initialProps: { position: 1 as number | null, active: true } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useProgressRead", () => {
  it("is the read for the question on now, once it is back", async () => {
    const { result } = setup(async () => answeredBy(1));
    await act(async () => {});
    expect(result.current).toEqual({ position: 1, progress: answeredBy(1) });
  });

  it("is null while answers are not being collected", async () => {
    const { result, rerender } = setup(async () => answeredBy(1));
    await act(async () => {});
    rerender({ position: 1, active: false });
    expect(result.current).toBeNull();
  });

  it("forgets an earlier visit's read when the room comes back to that question", async () => {
    // Question 2's read never comes back; question 1's second read hangs too.
    let reads = 0;
    const ask = vi.fn(async (): Promise<SessionProgress | null> => {
      reads += 1;
      if (reads === 1) return answeredBy(1);
      return new Promise(() => {});
    });
    const { result, rerender } = setup(ask);
    await act(async () => {});
    expect(result.current?.position).toBe(1);

    rerender({ position: 2, active: true });
    expect(result.current).toBeNull();
    rerender({ position: 1, active: true });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    // Back on question 1: the first visit's read is not this visit's.
    expect(result.current).toBeNull();
    expect(ask.mock.calls.length).toBeGreaterThan(2);
  });

  it("forgets the read across a pause, so a resume waits for a fresh one", async () => {
    let reads = 0;
    const ask = async (): Promise<SessionProgress | null> => {
      reads += 1;
      return reads === 1 ? answeredBy(1) : new Promise(() => {});
    };
    const { result, rerender } = setup(ask);
    await act(async () => {});
    rerender({ position: 1, active: false });
    rerender({ position: 1, active: true });
    expect(result.current).toBeNull();
  });
});
