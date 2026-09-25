/**
 * Why a practice answer was not checked (#241), in the words a student is shown. No scoring and no
 * key-reading code, so the player can import it.
 */
export const PRACTICE_REFUSALS = {
  signed_out: "Sign in again to keep practising.",
  malformed: "That answer could not be read. Try again.",
  too_large: "That answer is too large to send.",
  rate_limited: "You are answering very quickly. Wait a minute, then try again.",
  not_found: "This practice is no longer available. Go back to your classes to see what is shared.",
  answered: "You have already answered this item. Start over to answer it again.",
  failed: "Your answer could not be checked. Try again.",
} as const;

export type PracticeRefusal = keyof typeof PRACTICE_REFUSALS;

export function isPracticeRefusal(value: unknown): value is PracticeRefusal {
  return typeof value === "string" && Object.hasOwn(PRACTICE_REFUSALS, value);
}

/** Where a practice answer is posted. */
export const PRACTICE_ANSWER_ROUTE = "/api/practice/answer";
