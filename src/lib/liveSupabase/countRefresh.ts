/**
 * When the host's console tells the database how many students are in the room (#426).
 *
 * Phones no longer receive Presence. "12 in this session" comes from `participant_count` on
 * `live.session_public_state`, which every phone already hears by `postgres_changes`. Only the
 * host's console still receives Presence, so only it knows who is here now and who has left; it
 * reports the size of its roster with `refresh_participant_count`. Someone who has left is not
 * counted (owner decision, 2026-10-21).
 *
 * Every write of that row is a message to every phone, so how often the console reports is what
 * bounds the messages a class is sent for its own coming and going. The rule here:
 *
 *   * Only a roster of a **different size** from the one last reported is a reason to report. A
 *     phone dropping and coming back inside one interval, or a re-track, changes nothing.
 *   * At most once per `intervalMs`: the first change after a quiet spell is reported at once, and
 *     any that follow inside the interval are caught by one more report at its end, with whatever
 *     the roster is by then. So a burst of a hundred joins over ten seconds is four or five
 *     writes, not a hundred, and the last arrival or departure is counted within one interval.
 *
 * The database writes only when the number has changed, so a report that changes nothing sends
 * phones nothing either.
 */
import type { Participant } from "@/lib/live";

/** A few seconds: inside the issue's "right within a few seconds of a join". */
export const COUNT_REFRESH_MS = 3000;

/**
 * How many times a report that failed is made again, an interval apart, before waiting for the
 * roster's next change. A failed report for the last arrival would otherwise leave the waiting
 * screen a few short until someone else comes or goes.
 */
export const COUNT_REFRESH_RETRIES = 3;

/** The clock and the timer, injectable so a test can move time by hand. */
export interface RefreshTimers {
  now: () => number;
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const REAL_TIMERS: RefreshTimers = {
  // Monotonic, so a clock set back does not hold a report for as long as it was set back.
  now: () => performance.now(),
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface CountRefresh {
  /** Hands over the roster a presence sync produced. Reports, or schedules a report, if its size changed. */
  saw(roster: readonly Participant[]): void;
  /** Stops for good: nothing waiting is reported, and nothing later is. */
  stop(): void;
}

/** How many different people a roster holds: one phone tracked twice is still one student. */
function sizeOf(roster: readonly Participant[]): number {
  return new Set(roster.map((person) => person.participantId)).size;
}

/**
 * `report` is handed the number to store and answers whether the database took it (or nothing,
 * when it cannot tell, which is taken as a yes). A report that answers false is made again
 * `intervalMs` later, up to `COUNT_REFRESH_RETRIES` times in a row.
 */
export function createCountRefresh(
  report: (present: number) => Promise<boolean> | void,
  intervalMs: number = COUNT_REFRESH_MS,
  timers: RefreshTimers = REAL_TIMERS,
): CountRefresh {
  /** The roster's size at the last sync. */
  let latest: number | null = null;
  /** The number the database last took. */
  let reported: number | null = null;
  let lastAsked = Number.NEGATIVE_INFINITY;
  let waiting: unknown = null;
  let inFlight = false;
  let stopped = false;
  let failures = 0;

  /** Reports now, or at the end of the interval, unless a report is already due or under way. */
  function schedule(): void {
    if (stopped || waiting !== null || inFlight) return;
    const wait = lastAsked + intervalMs - timers.now();
    if (wait <= 0) reportNow();
    else waiting = timers.set(reportNow, wait);
  }

  function reportNow(): void {
    waiting = null;
    if (stopped || latest === null || latest === reported) return;
    lastAsked = timers.now();
    const sending = latest;
    const answered = report(sending);
    if (answered === undefined) {
      reported = sending;
      return;
    }
    inFlight = true;
    void answered.then(
      (ok) => settle(ok, sending),
      () => settle(false, sending),
    );
  }

  function settle(ok: boolean, sent: number): void {
    inFlight = false;
    if (stopped) return;
    if (ok) {
      failures = 0;
      reported = sent;
      // The roster moved while the report was under way: one more, at the end of the interval.
      if (latest !== reported) schedule();
      return;
    }
    failures += 1;
    if (waiting !== null || failures > COUNT_REFRESH_RETRIES) return;
    waiting = timers.set(reportNow, intervalMs);
  }

  return {
    saw(roster) {
      if (stopped) return;
      latest = sizeOf(roster);
      // Already due or under way: that report reads `latest` when it goes, or checks it after.
      if (latest === reported || waiting !== null || inFlight) return;
      failures = 0;
      schedule();
    },
    stop() {
      stopped = true;
      if (waiting !== null) timers.clear(waiting);
      waiting = null;
    },
  };
}
