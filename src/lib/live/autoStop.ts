/**
 * Ending the timer once everyone has answered, as Kahoot does: the rule, and the settle window.
 *
 * **What it sends.** Nothing new. The console sends the existing `stop_timer` — the "Stop timer"
 * button's own command — so the database's rules are the ones that already hold for that button,
 * and no migration is involved. It never reveals: the teacher still presses Show answer.
 *
 * **When.** A teacher-paced room, running, on a question with a clock that has not run out and is
 * not revealed, with at least one person in the roster and nobody left to answer *this* question.
 * Who is left is per person, never one count against another: everyone the roster holds, connected
 * or away, and everyone the progress read says has joined. Comparing answers (which include phones
 * that answered and then dropped out of presence) with phones connected now would end the timer on
 * a student still thinking. The read must have been taken for this position on this visit, so a
 * read from the previous question, or from an earlier visit to this one, can never satisfy it. When
 * in doubt it does nothing and the clock runs out as it always has.
 *
 * **Settling.** The rule has to hold for `AUTO_STOP_SETTLE_MS` before the stop is sent, and any
 * moment it does not hold starts the wait again, so a phone that has just joined or reconnected
 * has time to be counted. Then it fires once per visit to a question. A teacher who presses "Add
 * 15 seconds" while everyone has answered has said they want the time, so it stands down for the
 * rest of that question.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { isStudentPaced, type LiveSessionState } from "./state";
import type { ItemTimer } from "./timer";

/** How long everyone must have answered before the timer is ended. */
export const AUTO_STOP_SETTLE_MS = 1_500;

/** What the console knows, person by person, about who has answered. */
export interface AnswerWatch {
  /** The position this visit's progress read is about, or null before the first one is back. */
  position: number | null;
  /** People in the roster, connected or away. */
  roster: number;
  /** People who have not answered that position, or null when that is not known. */
  waiting: number | null;
}

/** Whether everyone in the room has answered the question on a running clock, right now. */
export function shouldAutoStop(state: LiveSessionState, watch: AnswerWatch, now: number): boolean {
  if (isStudentPaced(state)) return false;
  if (state.status !== "running" || state.position === null || state.reveal) return false;
  const { endsAt } = state.timer;
  if (endsAt === null || endsAt <= now) return false;
  if (watch.position !== state.position || watch.waiting === null) return false;
  return watch.roster >= 1 && watch.waiting === 0;
}

/** What the console remembers between two looks at the room. */
export interface AutoStopMemory {
  /** The question this memory is about. A different one starts afresh. */
  position: number | null;
  /** The clock as last seen, to tell "Add 15 seconds" from anything else. */
  clock: Pick<ItemTimer, "endsAt" | "remainingMs">;
  /** When the rule started holding without a break, or null. */
  since: number | null;
  /** Fired, or stood down, for this visit to the question. */
  done: boolean;
}

export const AUTO_STOP_IDLE: AutoStopMemory = {
  position: null,
  clock: { endsAt: null, remainingMs: null },
  since: null,
  done: false,
};

export interface AutoStopInput {
  state: LiveSessionState;
  watch: AnswerWatch;
  /** The teacher's setting on this device. */
  enabled: boolean;
}

export interface AutoStopStep {
  memory: AutoStopMemory;
  /** Send `stop_timer` now. True at most once per visit to a question. */
  fire: boolean;
  /** Look again after this many ms, or null when nothing is being waited for. */
  waitMs: number | null;
}

/** Whether the clock gained time on the same question: "Add 15 seconds", running or paused. */
function gainedTime(before: AutoStopMemory["clock"], after: ItemTimer): boolean {
  if (before.endsAt !== null && after.endsAt !== null) return after.endsAt > before.endsAt;
  if (before.remainingMs !== null && after.remainingMs !== null) {
    return after.remainingMs > before.remainingMs;
  }
  // A pause or a resume moves the clock from one field to the other: not added time.
  return false;
}

/** One look at the room. Never mutates. */
export function stepAutoStop(
  memory: AutoStopMemory,
  { state, watch, enabled }: AutoStopInput,
  now: number,
): AutoStopStep {
  const clock = { endsAt: state.timer.endsAt, remainingMs: state.timer.remainingMs };
  const fresh = memory.position !== state.position;
  const held: AutoStopMemory = fresh ? { ...AUTO_STOP_IDLE, position: state.position } : memory;
  const holds = shouldAutoStop(state, watch, now);

  if (held.done) return { memory: { ...held, clock }, fire: false, waitMs: null };
  if (!fresh && gainedTime(held.clock, state.timer) && (holds || held.since !== null)) {
    return { memory: { ...held, clock, since: null, done: true }, fire: false, waitMs: null };
  }
  if (!enabled || !holds) {
    return { memory: { ...held, clock, since: null }, fire: false, waitMs: null };
  }

  const since = held.since ?? now;
  const left = since + AUTO_STOP_SETTLE_MS - now;
  if (left > 0) return { memory: { ...held, clock, since }, fire: false, waitMs: left };
  return { memory: { ...held, clock, since: null, done: true }, fire: true, waitMs: null };
}
