import { describe, expect, it } from "vitest";
import {
  LIVE_REFUSALS,
  TIMER_COMMANDS,
  applyHostCommand,
  canRunHostCommand,
  canSubmit,
  chooseTimer,
  initialSessionState,
  type HostCommand,
  type LiveSessionState,
  type TimerCommand,
} from "@/lib/live";

/**
 * The state machine with a timer on it (#182). Every expectation here has a twin in
 * `supabase/tests/database/live_item_timer.test.sql`, which holds the trigger to the same moves.
 */
const NOW = 1_800_000_000_000;
const ITEMS = ["a", "b", "c"];

function move(
  state: LiveSessionState,
  command: HostCommand | TimerCommand,
  now = NOW,
): LiveSessionState {
  const result = applyHostCommand(state, command, now);
  if (!result.ok) throw new Error(`${command} was refused: ${result.refusal}`);
  return result.state;
}

function timed(seconds: number | null = 30): LiveSessionState {
  const chosen = chooseTimer(initialSessionState(3), seconds);
  if (!chosen.ok) throw new Error(chosen.refusal);
  return chosen.state;
}

describe("choosing a time", () => {
  it("starts the room with the timer off", () => {
    expect(initialSessionState(3).timer).toEqual({
      seconds: null,
      endsAt: null,
      remainingMs: null,
    });
  });

  it("takes any of the offered times, and off", () => {
    for (const seconds of [30, 60, 90, 120, null]) {
      expect(timed(seconds).timer.seconds).toBe(seconds);
    }
  });

  it("refuses a time that is not offered", () => {
    const refused = chooseTimer(initialSessionState(3), 45);
    expect(refused).toEqual({ ok: false, refusal: "bad_timer", message: LIVE_REFUSALS.bad_timer });
  });

  it("refuses to change anything about an ended room", () => {
    const ended = move(timed(), "end");
    expect(chooseTimer(ended, 60)).toMatchObject({ ok: false, refusal: "not_open" });
  });

  it("applies to the next item, not to the one already on the screen", () => {
    const on = move(initialSessionState(3), "start");
    const chosen = chooseTimer(on, 60);
    if (!chosen.ok) throw new Error(chosen.refusal);
    expect(chosen.state.timer).toEqual({ seconds: 60, endsAt: null, remainingMs: null });
    expect(move(chosen.state, "advance").timer.endsAt).toBe(NOW + 60_000);
  });
});

describe("the moves, with a timer", () => {
  it("starts the clock on start and gives every new item the whole time", () => {
    const started = move(timed(30), "start");
    expect(started.timer).toEqual({ seconds: 30, endsAt: NOW + 30_000, remainingMs: null });
    const next = move(started, "advance", NOW + 50_000);
    expect(next.timer.endsAt).toBe(NOW + 80_000);
  });

  it("freezes on pause and restores what was left on resume", () => {
    const started = move(timed(30), "start");
    const paused = move(started, "pause", NOW + 10_000);
    expect(paused.timer).toEqual({ seconds: 30, endsAt: null, remainingMs: 20_000 });
    const resumed = move(paused, "resume", NOW + 500_000);
    expect(resumed.timer).toEqual({ seconds: 30, endsAt: NOW + 520_000, remainingMs: null });
  });

  it("stops the clock when the answer is shown and when the room ends", () => {
    const started = move(timed(30), "start");
    expect(move(started, "reveal").timer).toEqual({
      seconds: 30,
      endsAt: null,
      remainingMs: null,
    });
    expect(move(started, "end").timer.endsAt).toBeNull();
  });
});

describe("the host's timer buttons", () => {
  it("are exactly two, and are not room moves", () => {
    expect(TIMER_COMMANDS).toEqual(["extend_timer", "stop_timer"]);
  });

  it("add fifteen seconds, and stop the clock", () => {
    const started = move(timed(30), "start");
    expect(move(started, "extend_timer", NOW + 1_000).timer.endsAt).toBe(NOW + 45_000);
    expect(move(started, "stop_timer").timer).toEqual({
      seconds: 30,
      endsAt: null,
      remainingMs: null,
    });
  });

  it("add to a paused clock without starting it", () => {
    const paused = move(move(timed(30), "start"), "pause", NOW + 25_000);
    expect(move(paused, "extend_timer", NOW + 99_000).timer).toEqual({
      seconds: 30,
      endsAt: null,
      remainingMs: 20_000,
    });
  });

  it("are refused where there is no clock, and greyed out with it", () => {
    const untimed = move(initialSessionState(3), "start");
    const revealed = move(move(timed(30), "start"), "reveal");
    for (const state of [untimed, revealed]) {
      for (const command of TIMER_COMMANDS) {
        expect(applyHostCommand(state, command, NOW)).toMatchObject({ refusal: "no_timer" });
        expect(canRunHostCommand(state, command)).toBe(false);
      }
    }
    expect(applyHostCommand(timed(), "extend_timer", NOW)).toMatchObject({
      refusal: "not_started",
    });
    expect(applyHostCommand(move(timed(), "end"), "stop_timer", NOW)).toMatchObject({
      refusal: "not_open",
    });
  });
});

describe("canSubmit, against the clock", () => {
  const started = move(timed(30), "start");

  it("takes an answer up to two seconds after the time is up", () => {
    expect(canSubmit(started, "a", ITEMS, NOW + 32_000)).toEqual({ ok: true, position: 1 });
  });

  it("refuses one after that, with its own code", () => {
    expect(canSubmit(started, "a", ITEMS, NOW + 32_001)).toEqual({
      ok: false,
      refusal: "time_up",
      message: "Time is up.",
    });
  });

  it("takes answers for as long as it likes once the host stops the clock", () => {
    const stopped = move(started, "stop_timer");
    expect(canSubmit(stopped, "a", ITEMS, NOW + 10_000_000).ok).toBe(true);
  });

  it("says paused, not time up, while the room is paused", () => {
    const paused = move(started, "pause", NOW + 10_000);
    expect(canSubmit(paused, "a", ITEMS, NOW + 10_000_000)).toMatchObject({ refusal: "paused" });
  });

  it("says the key is showing, not time up, once it is", () => {
    const shown = move(started, "reveal");
    expect(canSubmit(shown, "a", ITEMS, NOW + 60_000)).toMatchObject({
      refusal: "already_revealed",
    });
  });
});
