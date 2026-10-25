/**
 * A start for a class that is not in the teacher's workspace, or no longer exists (ADR 0013,
 * `start_session`'s LC001). The quiz page says the same.
 */
export const LIVE_CLASS_REFUSAL = "That class is not in your workspace. Choose another class.";

/**
 * Why a case study's live session could not start, carried back on the query string (#184).
 *
 * The reason is one of `StartSessionResult`'s four, but it arrives as whatever the address bar
 * says, so it is read as untrusted text: only the three known reasons get their own sentence, and
 * nothing typed into the URL is ever shown back.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
export function caseStudyLiveStartMessage(
  value: string | string[] | undefined,
): string | undefined {
  const reason = Array.isArray(value) ? value[0] : value;
  if (reason === undefined) return undefined;
  // `start_session` answers 22023 for an unpublished case study and for a step still in draft.
  if (reason === "empty") {
    return "Publish this case study and its six questions before starting a live session.";
  }
  if (reason === "gone") return "That case study no longer exists.";
  if (reason === "class") return LIVE_CLASS_REFUSAL;
  return "The live session could not be started. Try again.";
}
