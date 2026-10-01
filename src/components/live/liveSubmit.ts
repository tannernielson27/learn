import { isLiveSessionError } from "@/lib/live/errors";

/** A live room only sends the answer; it is scored, and shown, when the host reveals it. */
export const LIVE_BUSY_LABEL = "Sending your answer";

const NOT_SENT = "Your answer was not sent. Try again.";

/**
 * What a phone says when an answer did not go through: the room's own sentence for a refusal
 * ("The session has moved on to another item."), or that it was not sent, for a dropped request.
 */
export function liveSubmitFailure(error: unknown): string {
  return isLiveSessionError(error) ? error.message : NOT_SENT;
}
