import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollWhileVisible } from "./pollWhileVisible";

const INTERVAL = 3_000;

let visibility: DocumentVisibilityState = "visible";
const setVisibility = (next: DocumentVisibilityState) => {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("pollWhileVisible (#323)", () => {
  it("asks at once and then on the cadence while the tab is visible", () => {
    const ask = vi.fn();
    const stop = pollWhileVisible(ask, INTERVAL);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVAL - 1);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(ask).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(ask).toHaveBeenCalledTimes(22);
    stop();
  });

  it("asks for nothing while the tab is hidden", () => {
    const ask = vi.fn();
    const stop = pollWhileVisible(ask, INTERVAL);
    vi.advanceTimersByTime(1_000);
    setVisibility("hidden");
    ask.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(ask).not.toHaveBeenCalled();
    stop();
  });

  it("asks once at once when the tab comes back, then resumes the cadence", () => {
    const ask = vi.fn();
    const stop = pollWhileVisible(ask, INTERVAL);
    vi.advanceTimersByTime(1_000);
    setVisibility("hidden");
    vi.advanceTimersByTime(60_000);
    ask.mockClear();
    setVisibility("visible");
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVAL - 1);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(ask).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not ask twice or start a second timer on a repeated visible event", () => {
    const ask = vi.fn();
    const stop = pollWhileVisible(ask, INTERVAL);
    setVisibility("visible");
    setVisibility("visible");
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVAL);
    expect(ask).toHaveBeenCalledTimes(2);
    stop();
  });

  it("waits for the tab to be visible when it starts hidden", () => {
    visibility = "hidden";
    const ask = vi.fn();
    const stop = pollWhileVisible(ask, INTERVAL);
    vi.advanceTimersByTime(60_000);
    expect(ask).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVAL);
    expect(ask).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stops the timer and the listener when stopped", () => {
    const ask = vi.fn();
    const remove = vi.spyOn(document, "removeEventListener");
    const stop = pollWhileVisible(ask, INTERVAL);
    stop();
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    ask.mockClear();
    vi.advanceTimersByTime(60_000);
    setVisibility("hidden");
    setVisibility("visible");
    expect(ask).not.toHaveBeenCalled();
  });

  it("stops cleanly while hidden, leaving no timer and no listener", () => {
    const ask = vi.fn();
    const stop = pollWhileVisible(ask, INTERVAL);
    setVisibility("hidden");
    stop();
    ask.mockClear();
    setVisibility("visible");
    vi.advanceTimersByTime(60_000);
    expect(ask).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves the callers' guard in charge: a resolve after hide and stop sets nothing", async () => {
    // The shape every host poll uses: `watching` drops on cleanup, so an ask still in flight when
    // the effect is cleaned up (unmount or a dependency change) cannot set state afterwards.
    let settle: (value: number) => void = () => {};
    const set = vi.fn();
    let watching = true;
    const ask = () => {
      void new Promise<number>((resolve) => {
        settle = resolve;
      }).then((value) => {
        if (watching) set(value);
      });
    };
    const stop = pollWhileVisible(ask, INTERVAL);
    setVisibility("hidden");
    watching = false;
    stop();
    settle(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(set).not.toHaveBeenCalled();
  });
});
