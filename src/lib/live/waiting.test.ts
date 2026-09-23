import { describe, expect, it } from "vitest";
import type { LiveSessionState } from "./state";
import { NO_TIMER } from "./timer";
import { waitingCopy } from "./waiting";

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "lobby",
  position: null,
  itemCount: 12,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

describe("waitingCopy", () => {
  it("tells someone in the lobby that they are in and what happens next", () => {
    const copy = waitingCopy(state());
    expect(copy.headline).toBe("You are in.");
    expect(copy.detail).toContain("your instructor starts the session");
    expect(copy.progress).toBeNull();
  });

  it("names the item the room is on once it is running", () => {
    const copy = waitingCopy(state({ status: "running", position: 3 }));
    expect(copy.progress).toBe("Item 3 of 12");
    expect(copy.headline).toBe("The session is under way.");
  });

  it("says the answer is showing once the host has revealed it", () => {
    const copy = waitingCopy(state({ status: "running", position: 3, reveal: true }));
    expect(copy.headline).toBe("The answer is showing.");
    expect(copy.progress).toBe("Item 3 of 12");
  });

  it("keeps the position visible while the room is paused", () => {
    const copy = waitingCopy(state({ status: "paused", position: 7 }));
    expect(copy.headline).toBe("The session is paused.");
    expect(copy.progress).toBe("Item 7 of 12");
  });

  it("uses the same sentence for an ended session as every other screen", () => {
    const copy = waitingCopy(state({ status: "ended", position: 7 }));
    expect(copy.headline).toBe("This session has ended.");
    expect(copy.progress).toBeNull();
  });

  it("shows no position when the room reports one it cannot have", () => {
    expect(
      waitingCopy(state({ status: "running", position: 1, itemCount: 0 })).progress,
    ).toBeNull();
  });

  it("never carries an item, a key or anything a host holds", () => {
    const copy = waitingCopy(state({ status: "running", position: 3, reveal: true }));
    expect(Object.keys(copy).sort()).toEqual(["detail", "headline", "progress"]);
  });
});
