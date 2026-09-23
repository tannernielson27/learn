/**
 * The per-item timer (#182): what it is, how every room move changes it, and how a screen reads it.
 *
 * **Three numbers, and the database keeps the same three.** `seconds` is the time the host chose
 * for each item (`sessions.timer_seconds`, null when the timer is off). `endsAt` is when the item
 * the room is on runs out, in epoch milliseconds on the *session's* clock (`sessions.item_ends_at`).
 * `remainingMs` is what was left when the room paused (`sessions.timer_remaining_ms`). At most one
 * of the last two is set: a running clock has an end, a frozen one has a remainder, and an item
 * with no clock has neither.
 *
 * **One rule, said twice.** `settleTimer` below is what `applyHostCommand` runs after every move,
 * and `private.guard_session_change` (migration `20260923010000_item_timer.sql`) is the same rule
 * in Postgres, where `now()` is the only clock anyone can trust. The pgTAP file for that migration
 * walks the same moves this file's tests do.
 *
 * **What expiry does, and does not do.** When the time is up the item stops taking answers — the
 * server refuses them with `time_up`, two seconds after `endsAt` to allow for a phone's latency —
 * and nothing else happens. The room does not advance by itself; the host still does (#182).
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { SessionStatus } from "./state";

/** The per-item timer, as the database keeps it. See the file comment. */
export interface ItemTimer {
  /** The time the host chose for each item, in seconds. Null when the timer is off. */
  seconds: number | null;
  /** When the current item runs out, epoch ms on the session's clock. Null when not running. */
  endsAt: number | null;
  /** What was left when the room paused, in ms. Null unless a clock is frozen. */
  remainingMs: number | null;
}

/** No timer at all: off, and not running. */
export const NO_TIMER: ItemTimer = { seconds: null, endsAt: null, remainingMs: null };

/** What a host may choose per item: off, 30 seconds, a minute, 90 seconds, two minutes. */
export const TIMER_CHOICES = [null, 30, 60, 90, 120] as const;
export type TimerChoice = (typeof TIMER_CHOICES)[number];

/** "Add 15 seconds". */
export const TIMER_EXTEND_MS = 15_000;

/**
 * How late an answer may land and still be taken, for the time it spends in the air. A phone
 * that pressed Submit at 0:01 should not be refused because the request took a second and a half.
 */
export const SUBMIT_GRACE_MS = 2_000;

/** No clock ever runs past an hour, which is also `sessions.timer_seconds`' own upper bound. */
export const TIMER_MAX_MS = 3_600_000;

/** Whether `value` is one of the times a host is offered. */
export function isTimerChoice(value: unknown): value is TimerChoice {
  return (TIMER_CHOICES as readonly unknown[]).includes(value);
}

/** The part of a room's state the timer depends on. `LiveSessionState` is one of these. */
export interface TimedState {
  status: SessionStatus;
  position: number | null;
  reveal: boolean;
  timer: ItemTimer;
}

/** Where a move takes the room, before the timer has been worked out. */
export type TimedMove = Pick<TimedState, "status" | "position" | "reveal">;

/**
 * The timer after a move, from the timer before it. Never mutates.
 *
 *   * **A new item** (the position changed, including `start`) gets the whole chosen time: a
 *     running clock if the room is running, a frozen one if it is paused, none if the timer is off.
 *   * **Pausing** freezes whatever is left on a clock that is still running. A clock that has
 *     already run out is left as it is, so a pause can never hand back time that was up.
 *   * **Resuming** restarts a frozen clock from what was left.
 *   * **Showing the answer** and **ending** stop the clock. The chosen time stays for the next item.
 *
 * `seconds` is the chosen time after the move; it defaults to the one before it.
 */
export function settleTimer(
  before: TimedState,
  next: TimedMove,
  now: number,
  seconds: number | null = before.timer.seconds,
): ItemTimer {
  const clock = moveClock(before, next, now, seconds);
  if (next.reveal || next.status === "ended" || next.position === null) {
    return { seconds, endsAt: null, remainingMs: null };
  }
  return { seconds, ...clock };
}

type Clock = Pick<ItemTimer, "endsAt" | "remainingMs">;

function moveClock(
  before: TimedState,
  next: TimedMove,
  now: number,
  seconds: number | null,
): Clock {
  const kept: Clock = { endsAt: before.timer.endsAt, remainingMs: before.timer.remainingMs };

  if (next.position !== before.position) {
    if (seconds === null) return { endsAt: null, remainingMs: null };
    const whole = seconds * 1_000;
    return next.status === "paused"
      ? { endsAt: null, remainingMs: whole }
      : { endsAt: now + whole, remainingMs: null };
  }

  if (next.status === "paused" && before.status === "running") {
    const endsAt = before.timer.endsAt;
    if (endsAt === null || endsAt <= now) return kept;
    return { endsAt: null, remainingMs: endsAt - now };
  }

  if (next.status === "running" && before.status === "paused") {
    const left = before.timer.remainingMs;
    if (left === null) return kept;
    return { endsAt: now + left, remainingMs: null };
  }

  return kept;
}

/**
 * The timer after "add 15 seconds", or null when there is no clock on the item to add to.
 *
 * A running clock gets fifteen more seconds from its end — or from now, if it had already run out,
 * so the host's "a little longer" means fifteen seconds the room can actually use. A paused room's
 * clock stays frozen and simply holds fifteen seconds more. Nothing runs past `TIMER_MAX_MS`.
 */
export function extendTimer(state: TimedState, now: number): ItemTimer | null {
  const { endsAt, remainingMs: left } = state.timer;
  if (endsAt === null && left === null) return null;

  if (state.status === "paused") {
    const frozen = left ?? 0;
    return {
      ...state.timer,
      endsAt: null,
      remainingMs: Math.min(frozen + TIMER_EXTEND_MS, TIMER_MAX_MS),
    };
  }
  const from = Math.max(endsAt ?? now, now);
  return {
    ...state.timer,
    endsAt: Math.min(from + TIMER_EXTEND_MS, now + TIMER_MAX_MS),
    remainingMs: null,
  };
}

/** Whether the item has a clock on it at all, running or frozen. */
export function hasClock(timer: ItemTimer): boolean {
  return timer.endsAt !== null || timer.remainingMs !== null;
}

/**
 * Milliseconds left on the item, on the session's clock, never below zero. Null with no clock.
 *
 * `serverNow` must be the *session's* time, not this device's: a phone whose clock is two minutes
 * off would otherwise count down two minutes wrong. See `clockOffset`.
 */
export function remainingMs(timer: ItemTimer, serverNow: number): number | null {
  if (timer.remainingMs !== null) return Math.max(0, timer.remainingMs);
  if (timer.endsAt === null) return null;
  return Math.max(0, timer.endsAt - serverNow);
}

/**
 * Whether an answer arriving at `now` is too late: past the end *and* past the grace. A frozen
 * clock is never up — a paused room is refused as paused, which is the truer sentence.
 */
export function timeIsUp(timer: ItemTimer, now: number): boolean {
  return timer.endsAt !== null && now > timer.endsAt + SUBMIT_GRACE_MS;
}

/** "1:05". A part-second rounds up, so the clock reads 0:00 only once the time is really up. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * What a screen reader should have been told by now, or null.
 *
 * Three moments and no more — thirty seconds, ten seconds, and zero — so a countdown is heard at
 * the points where it changes what a student should do, not sixty times a minute. A screen puts
 * this in a polite live region; the region only speaks when the text changes.
 */
export function timerAnnouncement(ms: number | null): string | null {
  if (ms === null || ms > 30_000) return null;
  if (ms > 10_000) return "30 seconds left.";
  if (ms > 0) return "10 seconds left.";
  return "Time is up.";
}

/**
 * How far the session's clock is ahead of this device's, in ms, from one request: the server's
 * time as it answered, and this device's time as the request left and as the answer came back.
 * The server's reading is taken to be from the middle of the round trip, which is the best one
 * sample can do — wrong by at most half the round trip, and a phone's clock can be wrong by
 * minutes.
 */
export function clockOffset(serverNow: number, sentAt: number, receivedAt: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/**
 * Reads the three timer columns off a row, or null when any of them is not what the database
 * keeps. Timestamps arrive as ISO strings; Postgres' microseconds are dropped to milliseconds.
 */
export function readTimer(seconds: unknown, endsAt: unknown, left: unknown): ItemTimer | null {
  if (seconds !== null && typeof seconds !== "number") return null;
  if (left !== null && typeof left !== "number") return null;
  if (endsAt !== null && typeof endsAt !== "string") return null;
  const end = endsAt === null ? null : Date.parse(endsAt);
  if (end !== null && Number.isNaN(end)) return null;
  return { seconds, endsAt: end, remainingMs: left };
}
