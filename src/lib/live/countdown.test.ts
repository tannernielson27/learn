import { describe, expect, it } from "vitest";
import { COUNTDOWN_WARN_SECONDS, countdownReading, readCountdown } from "./countdown";
import { NO_TIMER, type ItemTimer } from "./timer";

const NOW = 1_800_000_000_000;

describe("countdownReading", () => {
  it("reads seconds, share, label and warning from what is left", () => {
    expect(countdownReading(21_000, 30_000)).toEqual({
      leftMs: 21_000,
      secondsLeft: 21,
      fraction: 0.7,
      warn: false,
      label: "0:21",
      frozen: false,
      up: false,
    });
  });

  it("warns at ten seconds and under, in step with the clock it shows", () => {
    expect(COUNTDOWN_WARN_SECONDS).toBe(10);
    expect(countdownReading(10_001, 30_000).warn).toBe(false);
    expect(countdownReading(10_000, 30_000)).toMatchObject({ warn: true, label: "0:10" });
    expect(countdownReading(400, 30_000)).toMatchObject({ warn: true, label: "0:01" });
  });

  it("stops warning once the time is up, which says so instead", () => {
    expect(countdownReading(0, 30_000)).toMatchObject({
      warn: false,
      up: true,
      fraction: 0,
      label: "0:00",
    });
  });

  it("keeps the share between 0 and 1, and treats no whole as what is left", () => {
    expect(countdownReading(45_000, 30_000).fraction).toBe(1);
    expect(countdownReading(-5, 30_000)).toMatchObject({ leftMs: 0, fraction: 0 });
    expect(countdownReading(12_000, null).fraction).toBe(1);
    expect(countdownReading(0, 0).fraction).toBe(0);
  });

  it("formats minutes", () => {
    expect(countdownReading(65_000, 120_000).label).toBe("1:05");
  });
});

describe("readCountdown", () => {
  const running = (left: number, seconds: number | null = 30): ItemTimer => ({
    seconds,
    endsAt: NOW + left,
    remainingMs: null,
  });

  it("is null for an item with no clock", () => {
    expect(readCountdown(NO_TIMER, NOW)).toBeNull();
  });

  it("reads a running clock against the session's now", () => {
    expect(readCountdown(running(8_000), NOW)).toMatchObject({
      secondsLeft: 8,
      warn: true,
      frozen: false,
    });
  });

  it("reads a frozen clock as frozen, whatever the time", () => {
    const frozen: ItemTimer = { seconds: 30, endsAt: null, remainingMs: 12_000 };
    expect(readCountdown(frozen, NOW + 60_000)).toMatchObject({
      leftMs: 12_000,
      frozen: true,
      fraction: 0.4,
    });
  });

  it("uses what is left as the whole when the chosen time is gone", () => {
    expect(readCountdown(running(5_000, null), NOW)?.fraction).toBe(1);
  });
});
