/**
 * What a student's phone says between items (#132).
 *
 * An instructor-paced room spends most of its life waiting: the class is looking at the front, and
 * the phone's job is to say what is happening and to change the moment the room does. This is that
 * sentence, derived from nothing but the four facts a participant may know —
 * `live.session_public_state` carries status, position, item count and the reveal flag, and no
 * more — so a waiting screen cannot accidentally be rendered from something it should not hold.
 *
 * The wording lives here rather than in the component for the reason `LIVE_REFUSALS` does: one
 * vocabulary, testable without a DOM, and the same sentence whichever screen shows it.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { LiveSessionState } from "./state";

export interface WaitingCopy {
  /** The line that answers "what is happening right now?" */
  headline: string;
  /** The sentence under it. */
  detail: string;
  /** "Item 3 of 12", or null when the room is not on an item anyone should be told about. */
  progress: string | null;
}

export function waitingCopy(state: LiveSessionState): WaitingCopy {
  const onAnItem =
    (state.status === "running" || state.status === "paused") &&
    state.position !== null &&
    state.position >= 1 &&
    state.position <= state.itemCount;
  const progress = onAnItem ? `Item ${state.position} of ${state.itemCount}` : null;

  switch (state.status) {
    case "lobby":
      return {
        headline: "You are in.",
        detail: "Wait here — your instructor starts the session from the front.",
        progress,
      };
    case "paused":
      return {
        headline: "The session is paused.",
        detail: "It will pick up where it left off.",
        progress,
      };
    case "ended":
      // The same sentence `LIVE_REFUSALS.not_open` uses, so a student who sees it here and a
      // student whose phone is refused an answer are told the same thing in the same words.
      return {
        headline: "This session has ended.",
        detail: "You can close this page.",
        progress,
      };
    case "running":
      return state.reveal
        ? {
            headline: "The answer is showing.",
            detail: "Your instructor is going through it at the front.",
            progress,
          }
        : {
            headline: "The session is under way.",
            detail: "Follow the item on the screen at the front. This page moves with the room.",
            progress,
          };
  }
}
