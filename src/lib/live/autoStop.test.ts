import { describe, expect, it } from "vitest";
import {
  AUTO_STOP_IDLE,
  AUTO_STOP_SETTLE_MS,
  shouldAutoStop,
  stepAutoStop,
  type AnswerCounts,
  type AutoStopMemory,
} from "./autoStop";
import { applyHostCommand, initialSessionState, type LiveSessionState } from "./state";

const NOW = 1_800_000_000_000;

/** A teacher-paced room running question `position` with a minute on the clock from `NOW`. */
function running(position = 1, seconds = 60): LiveSessionState {
  const lobby = initialSessionState(3, seconds);
  let state = applyHostCommand(lobby, "start", NOW);
  if (!state.ok) throw new Error(state.message);
  for (let at = 1; at < position; at += 1) {
    state = applyHostCommand(state.state, "advance", NOW);
    if (!state.ok) throw new Error(state.message);
  }
  return state.state;
}

function move(state: LiveSessionState, command: Parameters<typeof applyHostCommand>[1], now = NOW) {
  const moved = applyHostCommand(state, command, now);
  if (!moved.ok) throw new Error(moved.message);
  return moved.state;
}

const everyone = (position = 1, n = 3): AnswerCounts => ({ position, answered: n, present: n });

describe("shouldAutoStop: when everyone in the room has answered a timed question", () => {
  it("is true while running, timed, unrevealed, and answers reach the people present", () => {
    expect(shouldAutoStop(running(), everyone(), NOW + 5_000)).toBe(true);
  });

  it("is true when more have answered than are present (someone answered then dropped)", () => {
    expect(shouldAutoStop(running(), { position: 1, answered: 4, present: 3 }, NOW)).toBe(true);
  });

  it("is false while someone present has not answered", () => {
    expect(shouldAutoStop(running(), { position: 1, answered: 2, present: 3 }, NOW)).toBe(false);
  });

  it("is false with nobody in the room, even with answers counted", () => {
    expect(shouldAutoStop(running(), { position: 1, answered: 0, present: 0 }, NOW)).toBe(false);
    expect(shouldAutoStop(running(), { position: 1, answered: 2, present: 0 }, NOW)).toBe(false);
  });

  it("is false before any count has arrived", () => {
    expect(shouldAutoStop(running(), { position: null, answered: null, present: 3 }, NOW)).toBe(
      false,
    );
  });

  it("is false on a count left over from the previous question", () => {
    const second = running(2);
    expect(shouldAutoStop(second, everyone(1), NOW)).toBe(false);
    expect(shouldAutoStop(second, everyone(2), NOW)).toBe(true);
  });

  it("is false once the time has run out", () => {
    expect(shouldAutoStop(running(), everyone(), NOW + 60_000)).toBe(false);
    expect(shouldAutoStop(running(), everyone(), NOW + 59_999)).toBe(true);
  });

  it("is false with no timer at all, and once the timer has been stopped", () => {
    const untimed = move(initialSessionState(3, null), "start");
    expect(shouldAutoStop(untimed, everyone(), NOW)).toBe(false);
    expect(shouldAutoStop(move(running(), "stop_timer"), everyone(), NOW)).toBe(false);
  });

  it("is false during a reveal", () => {
    expect(shouldAutoStop(move(running(), "reveal"), everyone(), NOW)).toBe(false);
  });

  it("is false while paused, frozen clock and all", () => {
    expect(shouldAutoStop(move(running(), "pause", NOW + 1_000), everyone(), NOW + 2_000)).toBe(
      false,
    );
  });

  it("is false in the lobby and once ended", () => {
    expect(shouldAutoStop(initialSessionState(3, 60), everyone(), NOW)).toBe(false);
    expect(shouldAutoStop(move(running(), "end"), everyone(), NOW)).toBe(false);
  });

  it("is false in a student-paced room", () => {
    const paced: LiveSessionState = { ...running(), mode: "student_paced" };
    expect(shouldAutoStop(paced, everyone(), NOW)).toBe(false);
  });
});

/** Steps the memory along a list of `[now, state, counts, enabled?]` moments. */
function walk(
  moments: [number, LiveSessionState, AnswerCounts, boolean?][],
  from: AutoStopMemory = AUTO_STOP_IDLE,
) {
  let memory = from;
  const fires: number[] = [];
  let last: ReturnType<typeof stepAutoStop> | null = null;
  for (const [now, state, counts, enabled = true] of moments) {
    last = stepAutoStop(memory, { state, counts, enabled }, now);
    memory = last.memory;
    if (last.fire) fires.push(now);
  }
  return { memory, fires, last: last! };
}

describe("stepAutoStop: the settle window, and firing once", () => {
  const q1 = running();

  it("waits the settle window after the condition first holds, then fires once", () => {
    const first = stepAutoStop(
      AUTO_STOP_IDLE,
      { state: q1, counts: everyone(), enabled: true },
      NOW,
    );
    expect(first.fire).toBe(false);
    expect(first.waitMs).toBe(AUTO_STOP_SETTLE_MS);

    const early = stepAutoStop(
      first.memory,
      { state: q1, counts: everyone(), enabled: true },
      NOW + 1_000,
    );
    expect(early.fire).toBe(false);
    expect(early.waitMs).toBe(500);

    const due = stepAutoStop(
      early.memory,
      { state: q1, counts: everyone(), enabled: true },
      NOW + AUTO_STOP_SETTLE_MS,
    );
    expect(due.fire).toBe(true);
    expect(due.waitMs).toBeNull();

    // The stop is in flight and the state has not caught up: it does not fire again.
    const again = stepAutoStop(
      due.memory,
      { state: q1, counts: everyone(), enabled: true },
      NOW + 5_000,
    );
    expect(again.fire).toBe(false);
    expect(again.waitMs).toBeNull();
  });

  it("cancels when the condition stops holding inside the window, and starts over", () => {
    const { fires, memory } = walk([
      [NOW, q1, everyone()],
      // A phone joins: four present, three answered.
      [NOW + 1_000, q1, { position: 1, answered: 3, present: 4 }],
      [NOW + 1_600, q1, { position: 1, answered: 3, present: 4 }],
    ]);
    expect(fires).toEqual([]);
    expect(memory.since).toBeNull();

    // It answers: the window starts again from then.
    const { fires: later } = walk(
      [
        [NOW + 2_000, q1, everyone(1, 4)],
        [NOW + 3_000, q1, everyone(1, 4)],
        [NOW + 3_500, q1, everyone(1, 4)],
      ],
      memory,
    );
    expect(later).toEqual([NOW + 3_500]);
  });

  it("does not fire if the clock runs out inside the window", () => {
    const { fires } = walk([
      [NOW + 59_000, q1, everyone()],
      [NOW + 60_500, q1, everyone()],
    ]);
    expect(fires).toEqual([]);
  });

  it("resets on a new question, so the next question can fire too", () => {
    const q2 = running(2);
    const { fires } = walk([
      [NOW, q1, everyone()],
      [NOW + 1_500, q1, everyone()],
      // The room moves on with the last count still in hand: no fire on it.
      [NOW + 2_000, q2, everyone(1)],
      [NOW + 4_000, q2, everyone(1)],
      [NOW + 5_000, q2, everyone(2)],
      [NOW + 6_500, q2, everyone(2)],
    ]);
    expect(fires).toEqual([NOW + 1_500, NOW + 6_500]);
  });

  it("after it fired, extend_timer is refused and nothing fires again", () => {
    const fired = walk([
      [NOW, q1, everyone()],
      [NOW + 1_500, q1, everyone()],
    ]);
    expect(fired.fires).toEqual([NOW + 1_500]);

    const stopped = move(q1, "stop_timer", NOW + 1_600);
    // The room has no clock now: "Add 15 seconds" is refused, as the button is greyed out.
    expect(applyHostCommand(stopped, "extend_timer", NOW + 2_000)).toMatchObject({
      ok: false,
      refusal: "no_timer",
    });
    const { fires } = walk(
      [
        [NOW + 2_000, stopped, everyone()],
        [NOW + 9_000, stopped, everyone()],
      ],
      fired.memory,
    );
    expect(fires).toEqual([]);
  });

  it("stands down for the question when the teacher adds time while everyone has answered", () => {
    const extended = move(q1, "extend_timer", NOW + 1_000);
    const { fires, memory } = walk([
      [NOW, q1, everyone()],
      [NOW + 1_000, extended, everyone()],
      [NOW + 5_000, extended, everyone()],
    ]);
    expect(fires).toEqual([]);
    expect(memory.done).toBe(true);
  });

  it("still fires after time added earlier, before everyone had answered", () => {
    const extended = move(q1, "extend_timer", NOW + 1_000);
    const { fires } = walk([
      [NOW, q1, { position: 1, answered: 1, present: 3 }],
      [NOW + 1_000, extended, { position: 1, answered: 1, present: 3 }],
      [NOW + 2_000, extended, everyone()],
      [NOW + 3_500, extended, everyone()],
    ]);
    expect(fires).toEqual([NOW + 3_500]);
  });

  it("a pause and resume is not taken for added time", () => {
    const paused = move(q1, "pause", NOW + 1_000);
    const resumed = move(paused, "resume", NOW + 10_000);
    const { fires } = walk([
      [NOW, q1, everyone()],
      [NOW + 1_000, paused, everyone()],
      [NOW + 10_000, resumed, everyone()],
      [NOW + 11_500, resumed, everyone()],
    ]);
    expect(fires).toEqual([NOW + 11_500]);
  });

  it("does nothing while the setting is off, and can fire once it is back on", () => {
    const { fires } = walk([
      [NOW, q1, everyone(), false],
      [NOW + 2_000, q1, everyone(), false],
      [NOW + 3_000, q1, everyone(), true],
      [NOW + 4_500, q1, everyone(), true],
    ]);
    expect(fires).toEqual([NOW + 4_500]);
  });

  it("asks for no wake-up while there is nothing to wait for", () => {
    const { last } = walk([[NOW, q1, { position: 1, answered: 0, present: 3 }]]);
    expect(last.fire).toBe(false);
    expect(last.waitMs).toBeNull();
  });

  it("zero participants never fires, however long it waits", () => {
    const empty: AnswerCounts = { position: 1, answered: 0, present: 0 };
    const { fires } = walk([
      [NOW, q1, empty],
      [NOW + 30_000, q1, empty],
    ]);
    expect(fires).toEqual([]);
  });
});
