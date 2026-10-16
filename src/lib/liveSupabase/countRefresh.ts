/**
 * When the host's console asks the database to bring the waiting screen's count up to date (#426).
 *
 * Phones no longer receive Presence. "12 in this session" comes from `participant_count` on
 * `live.session_public_state`, which every phone already hears by `postgres_changes`. The
 * database writes it with every state change; between them, the host's console — which still
 * receives Presence, and so sees every join — asks for it with `refresh_participant_count`.
 *
 * Every write of that row is a message to every phone, so how often the console asks is what
 * bounds the messages a class is sent for its own arrival. The rule here:
 *
 *   * Only a participant the console has **not seen before** is a reason to ask. A leave, a phone
 *     dropping and coming back, a re-track: none of them changes how many have joined.
 *   * At most once per `intervalMs`: the first newcomer after a quiet spell is asked about at once,
 *     and any who arrive inside the interval are caught by one more ask at its end. So a burst of
 *     a hundred joins over ten seconds is four or five writes, not a hundred, and the last phone to
 *     arrive is counted within one interval of arriving.
 *
 * The database writes only when the number has changed, so an ask that finds nothing new sends
 * phones nothing either.
 */
import type { Participant } from "@/lib/live";

/** A few seconds: inside the issue's "right within a few seconds of a join". */
export const COUNT_REFRESH_MS = 3000;

/**
 * How many times an ask that failed is made again, an interval apart, before waiting for the next
 * newcomer or the room's next move. A failed ask for the last arrival would otherwise leave the
 * waiting screen a few short until the quiz starts.
 */
export const COUNT_REFRESH_RETRIES = 3;

/** The clock and the timer, injectable so a test can move time by hand. */
export interface RefreshTimers {
  now: () => number;
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const REAL_TIMERS: RefreshTimers = {
  // Monotonic, so a clock set back does not hold an ask for as long as it was set back.
  now: () => performance.now(),
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface CountRefresh {
  /** Hands over the roster a presence sync produced. Asks, or schedules an ask, if anyone is new. */
  saw(roster: readonly Participant[]): void;
  /** Stops for good: nothing waiting is asked, and nothing later is. */
  stop(): void;
}

/**
 * `ask` answers whether the database took it (or nothing, when it cannot tell). An ask that
 * answers false is made again `intervalMs` later, up to `COUNT_REFRESH_RETRIES` times in a row.
 */
export function createCountRefresh(
  ask: () => Promise<boolean> | void,
  intervalMs: number = COUNT_REFRESH_MS,
  timers: RefreshTimers = REAL_TIMERS,
): CountRefresh {
  const seen = new Set<string>();
  let lastAsked = Number.NEGATIVE_INFINITY;
  let waiting: unknown = null;
  let stopped = false;
  let failures = 0;

  const askNow = () => {
    waiting = null;
    if (stopped) return;
    lastAsked = timers.now();
    const answered = ask();
    if (answered === undefined) return;
    void answered.then(
      (ok) => settle(ok),
      () => settle(false),
    );
  };

  function settle(ok: boolean): void {
    if (ok) {
      failures = 0;
      return;
    }
    failures += 1;
    if (stopped || waiting !== null || failures > COUNT_REFRESH_RETRIES) return;
    waiting = timers.set(askNow, intervalMs);
  }

  return {
    saw(roster) {
      if (stopped) return;
      let someoneNew = false;
      for (const person of roster) {
        if (seen.has(person.participantId)) continue;
        seen.add(person.participantId);
        someoneNew = true;
      }
      // Already waiting to ask: that ask will count this newcomer too.
      if (!someoneNew || waiting !== null) return;
      failures = 0;
      const wait = lastAsked + intervalMs - timers.now();
      if (wait <= 0) askNow();
      else waiting = timers.set(askNow, wait);
    },
    stop() {
      stopped = true;
      if (waiting !== null) timers.clear(waiting);
      waiting = null;
    },
  };
}
