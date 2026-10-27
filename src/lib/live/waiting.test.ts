import { describe, expect, it } from "vitest";
import { LIVE_REFUSALS } from "./errors";
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
  it("tells someone in the lobby that they are in and what happens next, in one line", () => {
    const copy = waitingCopy(state());
    expect(copy.headline).toBe("You’re in.");
    expect(copy.progress).toBeNull();
  });

  it("names the question the session is on once it is running", () => {
    const copy = waitingCopy(state({ status: "running", position: 3 }));
    expect(copy.progress).toBe("Question 3 of 12");
    expect(copy.headline).toBe("The live session is under way.");
  });

  it("says the answer is showing once the teacher has revealed it", () => {
    const copy = waitingCopy(state({ status: "running", position: 3, reveal: true }));
    expect(copy.headline).toBe("The answer is showing.");
    expect(copy.progress).toBe("Question 3 of 12");
  });

  it("keeps the position visible while the session is paused", () => {
    const copy = waitingCopy(state({ status: "paused", position: 7 }));
    expect(copy.headline).toBe("The live session is paused.");
    expect(copy.progress).toBe("Question 7 of 12");
  });

  it("uses the same sentence for an ended session as a refused answer does", () => {
    const copy = waitingCopy(state({ status: "ended", position: 7 }));
    expect(copy.headline).toBe("This live session has ended.");
    expect(copy.headline).toBe(LIVE_REFUSALS.not_open);
    expect(copy.progress).toBeNull();
  });

  it("shows no position when the session reports one it cannot have", () => {
    expect(
      waitingCopy(state({ status: "running", position: 1, itemCount: 0 })).progress,
    ).toBeNull();
  });

  it("names no question in a student-paced session, which is on no one question (#185)", () => {
    const copy = waitingCopy(state({ status: "paused", position: 1, mode: "student_paced" }));
    expect(copy.headline).toBe("The live session is paused.");
    expect(copy.progress).toBeNull();
  });

  it("is one line and a position: no second sentence, no item, no key (#414)", () => {
    const copy = waitingCopy(state({ status: "running", position: 3, reveal: true }));
    expect(Object.keys(copy).sort()).toEqual(["headline", "progress"]);
  });
});
