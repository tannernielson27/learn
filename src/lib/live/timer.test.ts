import { describe, expect, it } from "vitest";
import {
  NO_TIMER,
  SUBMIT_GRACE_MS,
  TIMER_CHOICES,
  TIMER_EXTEND_MS,
  TIMER_MAX_MS,
  clockOffset,
  extendTimer,
  formatClock,
  isTimerChoice,
  readTimer,
  remainingMs,
  settleTimer,
  timerAnnouncement,
  timeIsUp,
  type ItemTimer,
  type TimedState,
} from "./timer";

const NOW = 1_800_000_000_000;

const running = (endsAt: number, seconds: number | null = 30): TimedState => ({
  status: "running",
  position: 1,
  reveal: false,
  timer: { seconds, endsAt, remainingMs: null },
});

describe("the choices a host is offered", () => {
  it("are off, 30 seconds, a minute, a minute and a half and two minutes", () => {
    expect(TIMER_CHOICES).toEqual([null, 30, 60, 90, 120]);
    for (const choice of TIMER_CHOICES) expect(isTimerChoice(choice)).toBe(true);
    for (const other of [0, 5, 45, 3600, -30, 30.5, "30", undefined]) {
      expect(isTimerChoice(other)).toBe(false);
    }
  });

  it("add fifteen seconds at a time, allow two seconds for latency, and cap at an hour", () => {
    expect(TIMER_EXTEND_MS).toBe(15_000);
    expect(SUBMIT_GRACE_MS).toBe(2_000);
    expect(TIMER_MAX_MS).toBe(3_600_000);
  });
});

describe("settleTimer, the one rule the reducer and the trigger both follow", () => {
  const lobby: TimedState = {
    status: "lobby",
    position: null,
    reveal: false,
    timer: { ...NO_TIMER, seconds: 30 },
  };

  it("starts the clock on the first item when a time is chosen", () => {
    const next = { status: "running", position: 1, reveal: false } as const;
    expect(settleTimer(lobby, next, NOW)).toEqual({
      seconds: 30,
      endsAt: NOW + 30_000,
      remainingMs: null,
    });
  });

  it("runs no clock when the timer is off", () => {
    const off = { ...lobby, timer: NO_TIMER };
    expect(settleTimer(off, { status: "running", position: 1, reveal: false }, NOW)).toEqual(
      NO_TIMER,
    );
  });

  it("gives a new item the whole time again, and drops a frozen remainder", () => {
    const before: TimedState = {
      status: "running",
      position: 1,
      reveal: true,
      timer: { seconds: 60, endsAt: null, remainingMs: null },
    };
    expect(settleTimer(before, { status: "running", position: 2, reveal: false }, NOW)).toEqual({
      seconds: 60,
      endsAt: NOW + 60_000,
      remainingMs: null,
    });
  });

  it("freezes the whole time on an item moved to while paused", () => {
    const before: TimedState = {
      status: "paused",
      position: 1,
      reveal: false,
      timer: { seconds: 30, endsAt: null, remainingMs: 4_000 },
    };
    expect(settleTimer(before, { status: "paused", position: 2, reveal: false }, NOW)).toEqual({
      seconds: 30,
      endsAt: null,
      remainingMs: 30_000,
    });
  });

  it("freezes what is left when the room pauses, and restores it when it resumes", () => {
    const paused = settleTimer(
      running(NOW + 12_345),
      { status: "paused", position: 1, reveal: false },
      NOW,
    );
    expect(paused).toEqual({ seconds: 30, endsAt: null, remainingMs: 12_345 });

    const later = NOW + 600_000;
    const resumed = settleTimer(
      { status: "paused", position: 1, reveal: false, timer: paused },
      { status: "running", position: 1, reveal: false },
      later,
    );
    expect(resumed).toEqual({ seconds: 30, endsAt: later + 12_345, remainingMs: null });
  });

  it("leaves a timer that has already run out as it is across a pause and a resume", () => {
    const expired = running(NOW - 1_000);
    const paused = settleTimer(expired, { status: "paused", position: 1, reveal: false }, NOW);
    expect(paused).toEqual(expired.timer);
    const resumed = settleTimer(
      { status: "paused", position: 1, reveal: false, timer: paused },
      { status: "running", position: 1, reveal: false },
      NOW + 50_000,
    );
    // No time is handed back by a pause: an item whose time was up is still up.
    expect(resumed).toEqual(expired.timer);
  });

  it("stops the clock when the answer is shown, and when the room ends", () => {
    const shown = settleTimer(
      running(NOW + 10_000),
      { status: "running", position: 1, reveal: true },
      NOW,
    );
    expect(shown).toEqual({ seconds: 30, endsAt: null, remainingMs: null });
    const ended = settleTimer(
      running(NOW + 10_000),
      { status: "ended", position: 1, reveal: false },
      NOW,
    );
    expect(ended).toEqual({ seconds: 30, endsAt: null, remainingMs: null });
  });

  it("keeps the clock when nothing about the room moved", () => {
    const before = running(NOW + 10_000);
    expect(settleTimer(before, { status: "running", position: 1, reveal: false }, NOW)).toEqual(
      before.timer,
    );
  });

  it("takes the chosen time from the state being moved to", () => {
    const next = { status: "running", position: 1, reveal: false } as const;
    expect(settleTimer(lobby, next, NOW, 90)).toMatchObject({ seconds: 90, endsAt: NOW + 90_000 });
  });

  it("never mutates what it was given", () => {
    const before = running(NOW + 10_000);
    const copy = structuredClone(before);
    settleTimer(before, { status: "paused", position: 1, reveal: false }, NOW);
    expect(before).toEqual(copy);
  });
});

describe("extendTimer", () => {
  it("adds fifteen seconds to a clock that is running", () => {
    expect(extendTimer(running(NOW + 5_000), NOW)).toEqual({
      seconds: 30,
      endsAt: NOW + 20_000,
      remainingMs: null,
    });
  });

  it("gives fifteen fresh seconds to a clock that has already run out", () => {
    expect(extendTimer(running(NOW - 60_000), NOW)?.endsAt).toBe(NOW + 15_000);
  });

  it("adds to a frozen clock without starting it", () => {
    const paused: TimedState = {
      status: "paused",
      position: 1,
      reveal: false,
      timer: { seconds: 30, endsAt: null, remainingMs: 1_000 },
    };
    expect(extendTimer(paused, NOW)).toEqual({ seconds: 30, endsAt: null, remainingMs: 16_000 });
  });

  it("freezes fifteen seconds onto a paused item whose time had run out", () => {
    const paused: TimedState = { ...running(NOW - 1_000), status: "paused" };
    expect(extendTimer(paused, NOW)).toEqual({ seconds: 30, endsAt: null, remainingMs: 15_000 });
  });

  it("never runs past an hour", () => {
    expect(extendTimer(running(NOW + TIMER_MAX_MS - 1_000), NOW)?.endsAt).toBe(NOW + TIMER_MAX_MS);
    const paused: TimedState = {
      status: "paused",
      position: 1,
      reveal: false,
      timer: { seconds: 30, endsAt: null, remainingMs: TIMER_MAX_MS },
    };
    expect(extendTimer(paused, NOW)?.remainingMs).toBe(TIMER_MAX_MS);
  });

  it("answers null when there is no clock to add to", () => {
    const none: TimedState = { ...running(NOW), timer: { ...NO_TIMER, seconds: 30 } };
    expect(extendTimer(none, NOW)).toBeNull();
  });
});

describe("reading the clock", () => {
  const timer = (partial: Partial<ItemTimer>): ItemTimer => ({ ...NO_TIMER, ...partial });

  it("counts down from the end time on the session's clock", () => {
    expect(remainingMs(timer({ endsAt: NOW + 9_500 }), NOW)).toBe(9_500);
    expect(remainingMs(timer({ endsAt: NOW - 9_500 }), NOW)).toBe(0);
  });

  it("holds still while frozen, and is null when there is no clock", () => {
    expect(remainingMs(timer({ remainingMs: 4_000 }), NOW + 99_999)).toBe(4_000);
    expect(remainingMs(NO_TIMER, NOW)).toBeNull();
  });

  it("says the time is up only once the grace has gone too", () => {
    const t = timer({ endsAt: NOW });
    expect(timeIsUp(t, NOW + SUBMIT_GRACE_MS)).toBe(false);
    expect(timeIsUp(t, NOW + SUBMIT_GRACE_MS + 1)).toBe(true);
    expect(timeIsUp(timer({ remainingMs: 0 }), NOW + 10_000_000)).toBe(false);
    expect(timeIsUp(NO_TIMER, NOW)).toBe(false);
  });

  it("formats minutes and seconds, rounding a part-second up", () => {
    expect(formatClock(120_000)).toBe("2:00");
    expect(formatClock(61_001)).toBe("1:02");
    expect(formatClock(9_000)).toBe("0:09");
    expect(formatClock(1)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("announces only at thirty seconds, ten seconds and zero", () => {
    expect(timerAnnouncement(null)).toBeNull();
    expect(timerAnnouncement(45_000)).toBeNull();
    expect(timerAnnouncement(30_000)).toBe("30 seconds left.");
    expect(timerAnnouncement(10_001)).toBe("30 seconds left.");
    expect(timerAnnouncement(10_000)).toBe("10 seconds left.");
    expect(timerAnnouncement(1)).toBe("10 seconds left.");
    expect(timerAnnouncement(0)).toBe("Time is up.");
  });
});

describe("clockOffset", () => {
  it("is how far the server's clock is ahead, measured at the middle of the round trip", () => {
    // A phone two minutes slow: it sent at 1000 and heard back at 1400 by its own clock, and the
    // server said it was 121200 in the middle of that.
    expect(clockOffset(121_200, 1_000, 1_400)).toBe(120_000);
    expect(clockOffset(1_000, 121_000, 121_000)).toBe(-120_000);
  });
});

describe("readTimer", () => {
  it("reads the three columns the database keeps", () => {
    expect(readTimer(30, "2027-01-15T08:00:00.123456+00:00", null)).toEqual({
      seconds: 30,
      endsAt: Date.parse("2027-01-15T08:00:00.123Z"),
      remainingMs: null,
    });
    expect(readTimer(null, null, 4_000)).toEqual({
      seconds: null,
      endsAt: null,
      remainingMs: 4_000,
    });
  });

  it("refuses anything that is not a timer, rather than guessing", () => {
    expect(readTimer("30", null, null)).toBeNull();
    expect(readTimer(30, "not a date", null)).toBeNull();
    expect(readTimer(30, 12, null)).toBeNull();
    expect(readTimer(30, null, "4000")).toBeNull();
    expect(readTimer(undefined, null, null)).toBeNull();
  });
});
