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
}

/** What a host can ask for. The set is closed, so a console cannot invent a fifth move. */
export const HOST_COMMANDS = ["start", "advance", "reveal", "pause", "resume", "end"] as const;
export type HostCommand = (typeof HOST_COMMANDS)[number];

export type TransitionResult =
  { ok: true; state: LiveSessionState } | { ok: false; refusal: LiveRefusal; message: string };

export type GuardResult = { ok: true } | { ok: false; refusal: LiveRefusal; message: string };

const refuse = (refusal: LiveRefusal): { ok: false; refusal: LiveRefusal; message: string } => ({
  ok: false,
  refusal,
  message: LIVE_REFUSALS[refusal],
});

/** The state a session opens in: in the lobby, on no item, with nothing revealed. */
export function initialSessionState(itemCount: number): LiveSessionState {
  return { status: "lobby", position: null, itemCount, reveal: false };
}

/**
 * Applies one host command. Never mutates: a successful move returns a new state object, a refused
 * one returns the code and the sentence to show and leaves the caller's state alone.
 *
 * The refusals the story names explicitly are `advance` past the end, `reveal` before the session
 * starts, and — through `canSubmit` below — answering after it ends.
 */
export function applyHostCommand(state: LiveSessionState, command: HostCommand): TransitionResult {
  // An ended session is over for every command, including `end` itself. #128: "no update of any
  // kind is allowed on an ended row", so its code can never start resolving again.
  if (state.status === "ended") return refuse("not_open");

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

/** Whether a command would be accepted right now. Host consoles disable their buttons with this. */
export function canRunHostCommand(state: LiveSessionState, command: HostCommand): boolean {
  return applyHostCommand(state, command).ok;
}

/**
 * Whether this participant may answer `itemId` right now.
 *
 * Beyond "not after the session ends", two rules earn their place: a paused room takes no answers,
 * and **an item whose key is already showing takes no answers either** — once the key is on the
 * screen a submission is not an answer, it is a copy.
 */
export function canSubmit(
  state: LiveSessionState,
  itemId: string,
  itemIds: readonly string[],
): GuardResult {
  if (state.status === "ended") return refuse("not_open");
  if (state.status === "lobby" || state.position === null) return refuse("not_started");
  if (state.status === "paused") return refuse("paused");
  if (state.reveal) return refuse("already_revealed");
  // `position` counts from 1, the array from 0.
  if (itemIds[state.position - 1] !== itemId) return refuse("wrong_item");
  return { ok: true };
}

/** The item the room is on, or null when it is not on one. Counts from 1, like `position`. */
export function itemAt<T>(items: readonly T[], state: LiveSessionState): T | null {
  if (state.status !== "running" && state.status !== "paused") return null;
  if (state.position === null) return null;
  return items[state.position - 1] ?? null;
}
