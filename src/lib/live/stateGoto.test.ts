import { describe, expect, it } from "vitest";
import {
  LIVE_REFUSALS,
  applyHostCommand,
  canGoTo,
  chooseTimer,
  goToItem,
  initialSessionState,
  type HostCommand,
  type LiveSessionState,
} from "@/lib/live";

/**
 * `goto` (#183): the host jumps to any item in the set, forwards or back. Every expectation here
 * has a twin in `supabase/tests/database/live_session_goto.test.sql`, which holds the trigger to
 * the same moves.
 */
const NOW = 1_800_000_000_000;

function drive(from: LiveSessionState, commands: readonly HostCommand[]): LiveSessionState {
  return commands.reduce((state, command) => {
    const result = applyHostCommand(state, command, NOW);
    if (!result.ok) throw new Error(`${command} was refused: ${result.refusal}`);
    return result.state;
  }, from);
}

function jump(state: LiveSessionState, position: number, now = NOW): LiveSessionState {
  const result = goToItem(state, position, now);
  if (!result.ok) throw new Error(`goto ${position} was refused: ${result.refusal}`);
  return result.state;
}

function refusalOf(state: LiveSessionState, position: number): string {
  const result = goToItem(state, position, NOW);
  if (result.ok) throw new Error(`goto ${position} was accepted`);
  return result.refusal;
}

const running = (itemCount = 4) => drive(initialSessionState(itemCount), ["start"]);

describe("goToItem", () => {
  it("jumps forwards past the next item", () => {
    expect(jump(running(), 3)).toMatchObject({ status: "running", position: 3, reveal: false });
  });

  it("goes back to an earlier item", () => {
    const onThird = drive(initialSessionState(4), ["start", "advance", "advance"]);
    expect(jump(onThird, 1)).toMatchObject({ status: "running", position: 1 });
  });

  it("reaches the last item and no further", () => {
    expect(jump(running(4), 4).position).toBe(4);
    expect(refusalOf(running(4), 5)).toBe("out_of_range");
  });

  it("refuses a position below one, and one that is not a whole number", () => {
    for (const position of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(refusalOf(running(), position), String(position)).toBe("out_of_range");
    }
  });

  it("refuses the item the room is already on", () => {
    expect(refusalOf(running(), 1)).toBe("same_item");
  });

  it("clears the reveal on every move, back as well as forwards", () => {
    const revealed = drive(initialSessionState(4), ["start", "advance", "reveal"]);
    expect(jump(revealed, 1).reveal).toBe(false);
    expect(jump(revealed, 4).reveal).toBe(false);
  });

  it("keeps a paused room paused", () => {
    const paused = drive(initialSessionState(4), ["start", "pause"]);
    expect(jump(paused, 3)).toMatchObject({ status: "paused", position: 3 });
  });

  it("is refused in the lobby and once the session has ended", () => {
    expect(refusalOf(initialSessionState(4), 2)).toBe("not_started");
    expect(refusalOf(drive(initialSessionState(4), ["start", "end"]), 2)).toBe("not_open");
  });

  it("never mutates the state it was given", () => {
    const before = running();
    const copy = structuredClone(before);
    jump(before, 3);
    expect(before).toEqual(copy);
  });

  it("gives the new item the whole chosen time, like advance does", () => {
    const chosen = chooseTimer(initialSessionState(4), 30);
    if (!chosen.ok) throw new Error(chosen.refusal);
    const started = drive(chosen.state, ["start"]);
    const later = NOW + 20_000;
    const advanced = applyHostCommand(started, "advance", later);
    if (!advanced.ok) throw new Error(advanced.refusal);
    const jumped = jump(started, 2, later);
    expect(jumped.timer).toEqual(advanced.state.timer);
    expect(jumped.timer.endsAt).toBe(later + 30_000);

    // Paused: the clock is frozen at the whole time, as `advance` would leave it.
    const paused = drive(started, ["pause"]);
    expect(jump(paused, 3, later).timer).toEqual({
      seconds: 30,
      endsAt: null,
      remainingMs: 30_000,
    });
  });

  it("has a sentence for each of its own refusals", () => {
    expect(LIVE_REFUSALS.out_of_range).toMatch(/\.$/);
    expect(LIVE_REFUSALS.same_item).toMatch(/\.$/);
  });
});

describe("canGoTo", () => {
  it("answers what goToItem would, without a clock", () => {
    expect(canGoTo(running(), 2)).toBe(true);
    expect(canGoTo(running(), 1)).toBe(false);
    expect(canGoTo(running(), 9)).toBe(false);
    expect(canGoTo(initialSessionState(4), 1)).toBe(false);
  });
});
