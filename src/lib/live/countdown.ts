/**
 * What a countdown shows, worked out once for every screen that draws one: the console's
 * `Countdown`, the shared `CountdownBar`, the projector and the phones.
 *
 * Everything here reads time **left**, measured on the session's clock by `remainingMs`, so a
 * phone whose own clock is wrong still shows the room's number (#182). Nothing here decides
 * anything: the server refuses a late answer whatever a screen says.
 *
 * The last ten seconds (owner decision 7, 2026-10-22): the bar turns `--flag` amber and the words
 * "10 seconds left" appear beside it, so colour is never the only signal. The warning follows the
 * clock the screen shows, which rounds a part-second up, so it starts as the clock reads 0:10.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { formatClock, remainingMs, type ItemTimer } from "./timer";

/** The last stretch of a clock, in whole seconds as shown, that is drawn in `--flag` with words. */
export const COUNTDOWN_WARN_SECONDS = 10;

export interface CountdownReading {
  /** Never below zero. */
  leftMs: number;
  /** Whole seconds as the clock shows them: a part-second rounds up. */
  secondsLeft: number;
  /** How much of the whole is left, 0 to 1: the bar's length. */
  fraction: number;
  /** In the last ten seconds and not yet up. */
  warn: boolean;
  /** "0:21", "1:05". */
  label: string;
  /** A paused room's clock, which holds still. */
  frozen: boolean;
  /** The time is up. */
  up: boolean;
}

/**
 * A reading from time left and the whole it is out of. With no whole (the time chosen has since
 * been changed or switched off), the bar is drawn full rather than guessed at.
 */
export function countdownReading(
  leftMs: number,
  wholeMs: number | null,
  frozen = false,
): CountdownReading {
  const left = Math.max(0, leftMs);
  const secondsLeft = Math.ceil(left / 1_000);
  const whole = wholeMs ?? left;
  const fraction = whole <= 0 ? 0 : Math.min(1, left / whole);
  return {
    leftMs: left,
    secondsLeft,
    fraction,
    warn: secondsLeft > 0 && secondsLeft <= COUNTDOWN_WARN_SECONDS,
    label: formatClock(left),
    frozen,
    up: left === 0,
  };
}

/** The item's countdown at `serverNow` (the session's clock), or null when it has no clock. */
export function readCountdown(timer: ItemTimer, serverNow: number): CountdownReading | null {
  const left = remainingMs(timer, serverNow);
  if (left === null) return null;
  const whole = timer.seconds === null ? null : timer.seconds * 1_000;
  return countdownReading(left, whole, timer.remainingMs !== null);
}
