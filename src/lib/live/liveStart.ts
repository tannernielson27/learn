/**
 * Why a case study's live session could not start, carried back on the query string (#184).
 *
 * The reason is one of `StartSessionResult`'s three, but it arrives as whatever the address bar
 * says, so it is read as untrusted text: only the two known reasons get their own sentence, and
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
    return "Publish this case study and all six of its steps before starting a live session.";
  }
  if (reason === "gone") return "That case study no longer exists.";
  return "The session could not be started. Try again.";
}
