/**
 * Why taking an assignment was refused (#208), in a student's words.
 *
 * The codes are the attempt functions' own (supabase/migrations/20260924030800_assignment_attempts.sql)
 * plus the two this app adds around them: `signed_out` and `failed`. Codes, not prose, are what
 * branches; an unrecognised code from the database is a fault, never passed through as a refusal.
 *
 * Holds no key and no scoring, so a student's screen may import it.
 */
export const ATTEMPT_REFUSALS = {
  signed_out: "Sign in again to keep working.",
  rate_limited: "Too many saves at once. Wait a moment and it will try again.",
  not_found: "This assignment is not available to you.",
  not_open: "This assignment has not opened yet.",
  closed: "This assignment has closed. What you saved will be submitted.",
  no_attempts_left: "You have used all your attempts.",
  already_submitted: "This attempt has been submitted.",
  wrong_item: "That item is not part of this assignment.",
  malformed: "That answer could not be read.",
  too_large: "That answer is too large to save.",
  changed: "Your answers changed while they were being submitted. Try again.",
  not_closed: "This assignment has not closed yet.",
  failed: "Something went wrong. Try again.",
} as const;

export type AttemptRefusal = keyof typeof ATTEMPT_REFUSALS;

const KNOWN = new Set<string>(Object.keys(ATTEMPT_REFUSALS));

/** A refusal code from the database, checked; null for none, `failed` for one this app does not know. */
export function asAttemptRefusal(value: unknown): AttemptRefusal | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && KNOWN.has(value) ? (value as AttemptRefusal) : "failed";
}

/**
 * Refusals a retry cannot fix: the attempt is over, gone or not this student's. Autosave stops
 * trying on these and the page is read again; every other refusal is retried.
 */
export const FINAL_REFUSALS: ReadonlySet<AttemptRefusal> = new Set<AttemptRefusal>([
  "signed_out",
  "not_found",
  "not_open",
  "closed",
  "already_submitted",
  "wrong_item",
  "malformed",
  "too_large",
]);
