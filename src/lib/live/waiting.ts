/**
 * What a student's phone says between questions (#132).
 *
 * A teacher-paced live session spends most of its life waiting: the class is looking at the front,
 * and the phone's job is to say what is happening and to change the moment the session does. This
 * is that line, derived from nothing but the four facts a participant may know —
 * `live.session_public_state` carries status, position, item count and the reveal flag, and no
 * more — so a waiting screen cannot accidentally be rendered from something it should not hold.
 *
 * One line per state, and no sentence under it (#414): a phone in a class shows the question and
 * almost nothing else, and a waiting screen is read at a glance.
 *
 * The wording lives here rather than in the component for the reason `LIVE_REFUSALS` does: one
 * vocabulary, testable without a DOM, and the same sentence whichever screen shows it.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { LIVE_REFUSALS } from "./errors";
import { isStudentPaced, type LiveSessionState } from "./state";

export interface WaitingCopy {
  /** The one line that answers "what is happening right now?" */
  headline: string;
  /** "Question 3 of 12", or null when the session is on no question anyone should be told about. */
  progress: string | null;
}

export function waitingCopy(state: LiveSessionState): WaitingCopy {
  // A student-paced session (#185) is on no one question, so there is no "Question 1 of 12".
  const onAnItem =
    !isStudentPaced(state) &&
    (state.status === "running" || state.status === "paused") &&
    state.position !== null &&
    state.position >= 1 &&
    state.position <= state.itemCount;
  const progress = onAnItem ? `Question ${state.position} of ${state.itemCount}` : null;

  switch (state.status) {
    case "lobby":
      return { headline: "You’re in.", progress };
    case "paused":
      return { headline: "The live session is paused.", progress };
    case "ended":
      // The sentence `LIVE_REFUSALS.not_open` uses, so a student who sees it here and a student
      // whose phone is refused an answer are told the same thing in the same words.
      return { headline: LIVE_REFUSALS.not_open, progress };
    case "running":
      return {
        headline: state.reveal ? "The answer is showing." : "The live session is under way.",
        progress,
      };
  }
}
