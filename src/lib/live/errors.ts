/**
 * Every way a live session can say no, and the one error type that carries it.
 *
 * Pure TypeScript: no React, Next or Supabase (ADR 0001, ADR 0002). One vocabulary for the state
 * machine, the transport interface and every adapter, so a refusal reads the same whether it came
 * from this process, from a route handler or — once #131 lands — from a Postgres trigger.
 */
import { SUBMIT_ERRORS } from "@/lib/ngn/submit";

/**
 * The refusal codes, each with the sentence a person should be shown. Messages never name
 * internals: "this session is paused", not "status !== running". The codes are what code branches
 * on; the sentences are what a console or a player renders.
 */
export const LIVE_REFUSALS = {
  /** The session has ended. Nothing works on it again, ever (#128's trigger agrees). */
  not_open: "This session has ended.",
  /** Still in the lobby: there is no item to be on, so nothing can be revealed or answered. */
  not_started: "This session has not started yet.",
  already_started: "This session has already started.",
  /** A session with nothing to run would sit on an item that does not exist. */
  empty_set: "This session has no items to run.",
  past_end: "That was the last item.",
  already_revealed: "The answer to this item is already showing.",
  not_running: "This session is not running.",
  not_paused: "This session is not paused.",
  paused: "This session is paused.",
  /** The room moved on between the student opening the item and answering it. */
  wrong_item: "The session has moved on to another item.",
  unknown_code: "No open session has that code.",
  not_joined: "You have not joined this session.",
  already_answered: "You have already answered this item.",
  no_name: "Enter a name so the class can see who answered.",
  name_too_long: "That name is too long. Use 60 characters or fewer.",
  /**
   * An adapter with a network boundary has to cap how often one person may answer, or `submit` is
   * unbounded scoring work (see `transport.ts`). #131's Postgres counter says no with this. The
   * in-memory adapter never raises it: its whole room is garbage collected with the test.
   */
  rate_limited: "Too many answers from this device. Wait a moment and try again.",
  /** Reuses the submit seam's own wording (#56) rather than inventing a second sentence. */
  malformed: SUBMIT_ERRORS.malformed,
  wrong_type: SUBMIT_ERRORS.wrongType,
} as const;

export type LiveRefusal = keyof typeof LIVE_REFUSALS;

/**
 * What a transport rejects with. Mirrors `ScoringError` in the NGN core: a `code` to branch on and
 * a message safe to show. Callers should read `code`; the message is for the screen.
 */
export class LiveSessionError extends Error {
  readonly code: LiveRefusal;

  constructor(code: LiveRefusal, message: string = LIVE_REFUSALS[code]) {
    super(message);
    this.name = "LiveSessionError";
    this.code = code;
  }
}

/** True when `error` is a refusal from a transport, narrowed so `code` can be read. */
export function isLiveSessionError(error: unknown): error is LiveSessionError {
  return error instanceof LiveSessionError;
}
