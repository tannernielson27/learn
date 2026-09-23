/**
 * The live-session state machine (#130, ADR 0002).
 *
 * A pure reducer over `{ status, position, reveal }`. The host console drives its buttons from it,
 * the in-memory adapter enforces it, and a future Supabase adapter will meet the same rules again
 * in Postgres — #128 puts them in a `before insert or update` trigger on `public.sessions`, so they
 * hold whatever a client believes. This module is the client-side counterpart, deliberately written
 * to agree with that trigger move for move (see the PR body for the comparison).
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { LIVE_REFUSALS, type LiveRefusal } from "./errors";
import {
  NO_TIMER,
  extendTimer,
  hasClock,
  isTimerChoice,
  settleTimer,
  timeIsUp,
  type ItemTimer,
} from "./timer";

export const SESSION_STATUSES = ["lobby", "running", "paused", "ended"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_MODES = ["instructor_paced", "student_paced"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

/**
 * Everything about the room that changes, and nothing that identifies a person.
 *
 * `position` is **one-based and null in the lobby**, matching `sessions.current_position` in #128
 * (`check (current_position >= 1)`, null until the session starts). Keeping the two the same means
 * a snapshot read from Postgres is this object, with no off-by-one adapter in between.
 */
export interface LiveSessionState {
  status: SessionStatus;
  /** Which item the room is on, counting from 1. Null before it starts. */
  position: number | null;
  /** How many items the set holds. Snapshotted when the session starts and constant after. */
  itemCount: number;
  /** Whether the current item's answer key has been shown (ADR 0003). */
  reveal: boolean;
  /**
   * The per-item timer (#182): the time chosen, and the clock on the current item, if any. See
   * `timer.ts`, and `sessions.timer_seconds`, `item_ends_at` and `timer_remaining_ms` in #182's
   * migration, which hold the same three numbers.
   */
  timer: ItemTimer;
}

/** What a host can ask for. The set is closed, so a console cannot invent a fifth move. */
export const HOST_COMMANDS = ["start", "advance", "reveal", "pause", "resume", "end"] as const;
export type HostCommand = (typeof HOST_COMMANDS)[number];

/**
 * The host's two timer buttons (#182): "Add 15 seconds" and "Stop timer". Not room moves — the room
 * stays on the same item in the same status — so they are kept out of `HOST_COMMANDS`, which the
 * gallery and the console map one-to-one onto the six methods that move a room.
 */
export const TIMER_COMMANDS = ["extend_timer", "stop_timer"] as const;
export type TimerCommand = (typeof TIMER_COMMANDS)[number];

export type TransitionResult =
  { ok: true; state: LiveSessionState } | { ok: false; refusal: LiveRefusal; message: string };

/**
 * Whether an answer may be taken. The accepted branch carries the narrowed `position`, so the
 * caller reaches the item without asserting past the compiler that it is not null.
 */
export type GuardResult =
  { ok: true; position: number } | { ok: false; refusal: LiveRefusal; message: string };

const refuse = (refusal: LiveRefusal): { ok: false; refusal: LiveRefusal; message: string } => ({
  ok: false,
  refusal,
  message: LIVE_REFUSALS[refusal],
});

/** The state a session opens in: in the lobby, on no item, with nothing revealed. */
export function initialSessionState(
  itemCount: number,
  timerSeconds: number | null = null,
): LiveSessionState {
  return {
    status: "lobby",
    position: null,
    itemCount,
    reveal: false,
    timer: { ...NO_TIMER, seconds: timerSeconds },
  };
}

/**
 * Applies one host command. Never mutates: a successful move returns a new state object, a refused
 * one returns the code and the sentence to show and leaves the caller's state alone.
 *
 * The refusals the story names explicitly are `advance` past the end, `reveal` before the session
 * starts, and — through `canSubmit` below — answering after it ends.
 */
export function applyHostCommand(
  state: LiveSessionState,
  command: HostCommand | TimerCommand,
  now: number,
): TransitionResult {
  // An ended session is over for every command, including `end` itself. #128: "no update of any
  // kind is allowed on an ended row", so its code can never start resolving again.
  if (state.status === "ended") return refuse("not_open");
  if (command === "extend_timer" || command === "stop_timer") {
    return applyTimerCommand(state, command, now);
  }

  const moved = moveRoom(state, command);
  if (!moved.ok) return moved;
  // The timer follows the move by the one rule the trigger follows too (`settleTimer`).
  return { ok: true, state: { ...moved.state, timer: settleTimer(state, moved.state, now) } };
}

/** The room move itself, before the timer is settled. */
function moveRoom(state: LiveSessionState, command: HostCommand): TransitionResult {
  switch (command) {
    case "start":
      if (state.status !== "lobby") return refuse("already_started");
      // A room that started on an empty set would be on an item that does not exist. #128 refuses
      // the same thing one step earlier, when `start_session` finds nothing published.
      if (state.itemCount < 1) return refuse("empty_set");
      return { ok: true, state: { ...state, status: "running", position: 1, reveal: false } };

    case "advance":
      if (state.status === "lobby" || state.position === null) return refuse("not_started");
      // `sessions_position_within_set` in #128: current_position <= length(item_set).
      if (state.position >= state.itemCount) return refuse("past_end");
      // A new item is a new question: whatever was showing is no longer the answer to it.
      return { ok: true, state: { ...state, position: state.position + 1, reveal: false } };

    case "reveal":
      // `sessions_reveal_needs_running_item` in #128: reveal implies a position and a status of
      // running or paused. Revealing while paused is allowed on purpose — a host pauses to talk
      // through an item and then shows the key.
      if (state.status === "lobby" || state.position === null) return refuse("not_started");
      if (state.reveal) return refuse("already_revealed");
      return { ok: true, state: { ...state, reveal: true } };

    case "pause":
      if (state.status === "lobby") return refuse("not_started");
      if (state.status !== "running") return refuse("not_running");
      return { ok: true, state: { ...state, status: "paused" } };

    case "resume":
      if (state.status !== "paused") return refuse("not_paused");
      return { ok: true, state: { ...state, status: "running" } };

    case "end":
      // Ending settles the row the way #128's trigger does: the reveal flag goes with it, because a
      // reveal left standing on an ended session is an open invitation to read the key.
      return { ok: true, state: { ...state, status: "ended", reveal: false } };
  }
}

/**
 * Jumps the room to `position` (#183): any item in the set, forwards or back, while it is running
 * or paused. Never mutates.
 *
 * It is `advance` with the destination chosen, and nothing more: the status stays what it was, the
 * reveal clears (a different item is a different question), and the clock follows by the same
 * `settleTimer` rule, so the item jumped to gets the whole chosen time. Answers already given to
 * it stay — one answer per person per item is a database fact — so going back shows that item's
 * results as they were. `private.guard_session_change` (migration 20260923060000) holds the same
 * rules, refusal for refusal:
 *
 *   * `not_open` once the session has ended, `not_started` in the lobby,
 *   * `out_of_range` for anything but a whole number from 1 to the set's length,
 *   * `same_item` for the item the room is already on, which would move nothing.
 */
export function goToItem(state: LiveSessionState, position: number, now: number): TransitionResult {
  if (state.status === "ended") return refuse("not_open");
  if (state.status === "lobby" || state.position === null) return refuse("not_started");
  if (!Number.isInteger(position) || position < 1 || position > state.itemCount) {
    return refuse("out_of_range");
  }
  if (position === state.position) return refuse("same_item");
  const moved: LiveSessionState = { ...state, position, reveal: false };
  return { ok: true, state: { ...moved, timer: settleTimer(state, moved, now) } };
}

/** Whether a jump to `position` would be accepted right now. The item strip greys out with it. */
export function canGoTo(state: LiveSessionState, position: number): boolean {
  return goToItem(state, position, 0).ok;
}

/** "Add 15 seconds" and "Stop timer": the room stays where it is and only the clock changes. */
function applyTimerCommand(
  state: LiveSessionState,
  command: TimerCommand,
  now: number,
): TransitionResult {
  if (state.status === "lobby" || state.position === null) return refuse("not_started");
  if (!hasClock(state.timer)) return refuse("no_timer");
  if (command === "stop_timer") {
    return {
      ok: true,
      state: { ...state, timer: { ...state.timer, endsAt: null, remainingMs: null } },
    };
  }
  // `hasClock` has just said there is one, so this is never null here.
  const timer = extendTimer(state, now) as ItemTimer;
  return { ok: true, state: { ...state, timer } };
}

/**
 * Chooses the per-item time (#182), or turns the timer off with null. It applies from the next
 * item the room moves to: the clock on the item already showing is left alone, because a class
 * halfway through answering should not have its time changed under it. "Add 15 seconds" and
 * "Stop timer" are what change that one.
 */
export function chooseTimer(state: LiveSessionState, seconds: number | null): TransitionResult {
  if (state.status === "ended") return refuse("not_open");
  if (!isTimerChoice(seconds)) return refuse("bad_timer");
  return { ok: true, state: { ...state, timer: { ...state.timer, seconds } } };
}

/**
 * Whether a command would be accepted right now. Host consoles disable their buttons with this.
 * The clock is not asked: no command is allowed or refused by what time it is.
 */
export function canRunHostCommand(
  state: LiveSessionState,
  command: HostCommand | TimerCommand,
): boolean {
  return applyHostCommand(state, command, 0).ok;
}

/**
 * Whether this participant may answer `itemId` right now.
 *
 * Beyond "not after the session ends", three rules earn their place: a paused room takes no
 * answers, **an item whose key is already showing takes no answers either** — once the key is on
 * the screen a submission is not an answer, it is a copy — and an item whose time is up takes none
 * once `SUBMIT_GRACE_MS` has passed too (#182). `now` is the session's clock, never a phone's.
 */
export function canSubmit(
  state: LiveSessionState,
  itemId: string,
  itemIds: readonly string[],
  now: number,
): GuardResult {
  if (state.status === "ended") return refuse("not_open");
  if (state.status === "lobby" || state.position === null) return refuse("not_started");
  if (state.status === "paused") return refuse("paused");
  if (state.reveal) return refuse("already_revealed");
  // #182. After the checks above and before `wrong_item`, in the order `begin_session_submission`
  // and `record_session_response` keep, so both adapters give the same answer to the same answer.
  if (timeIsUp(state.timer, now)) return refuse("time_up");
  // `position` counts from 1, the array from 0.
  if (itemIds[state.position - 1] !== itemId) return refuse("wrong_item");
  return { ok: true, position: state.position };
}

/** The item the room is on, or null when it is not on one. Counts from 1, like `position`. */
export function itemAt<T>(items: readonly T[], state: LiveSessionState): T | null {
  if (state.status !== "running" && state.status !== "paused") return null;
  if (state.position === null) return null;
  return items[state.position - 1] ?? null;
}
