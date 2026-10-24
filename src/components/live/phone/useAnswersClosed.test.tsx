import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUBMIT_GRACE_MS, type ItemTimer } from "@/lib/live/timer";
import { useAnswersClosed } from "./useAnswersClosed";

/**
 * Submit closes on the session's clock, never this phone's. Until the phone has heard the room
 * once it does not know that clock (the transport's offset is still zero), so it keeps Submit
 * open and leaves the refusal to the server; once it knows, it closes at the server's moment.
 */

/** The session's clock, as the server reads it. */
const SERVER = 1_800_000_000_000;
const ENDS_IN = 30_000;
const timer: ItemTimer = { seconds: 30, endsAt: SERVER + ENDS_IN, remainingMs: null };

/** A phone whose own clock is `skew` ms off the server's, and a transport that learns it late. */
function phone(skew: number) {
  vi.setSystemTime(SERVER + skew);
  let offset = 0;
  const serverNow = () => Date.now() + offset;
  const hook = renderHook(({ known }) => useAnswersClosed(timer, serverNow, known), {
    initialProps: { known: false },
  });
  return {
    closed: () => hook.result.current,
    /** The first view lands: the transport measures the offset, and the room renders. */
    sync: (measured = -skew) => {
      offset = measured;
      hook.rerender({ known: true });
    },
    /** Moves the phone's clock on, and so the server's. */
    advance: (ms: number) => act(() => vi.advanceTimersByTime(ms)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAnswersClosed", () => {
  it("keeps a fast phone open before it knows the session's clock, then closes on the server's time", () => {
    // A minute fast: on its own clock this question ran out half a minute ago.
    const room = phone(60_000);
    expect(room.closed()).toBe(false);
    room.advance(5_000);
    expect(room.closed()).toBe(false);

    room.sync();
    expect(room.closed()).toBe(false);
    // 5 s have gone by on the server: the rest of the time and the grace are still to come.
    room.advance(ENDS_IN - 5_000 + SUBMIT_GRACE_MS - 1);
    expect(room.closed()).toBe(false);
    room.advance(2);
    expect(room.closed()).toBe(true);
  });

  it("closes a slow phone on the server's time, not its own later one", () => {
    const room = phone(-60_000);
    room.sync();
    room.advance(ENDS_IN + SUBMIT_GRACE_MS - 1);
    expect(room.closed()).toBe(false);
    room.advance(2);
    expect(room.closed()).toBe(true);
  });

  it("re-arms when the offset is measured again, as after a reconnect", () => {
    const room = phone(0);
    room.sync();
    room.advance(10_000);
    // A new view says the phone was 5 s slow after all: the close comes 5 s sooner.
    room.sync(5_000);
    room.advance(ENDS_IN - 15_000 + SUBMIT_GRACE_MS - 1);
    expect(room.closed()).toBe(false);
    room.advance(2);
    expect(room.closed()).toBe(true);
  });
});
