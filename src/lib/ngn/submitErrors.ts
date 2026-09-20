/**
 * The two sentences a submission can be refused with, on their own.
 *
 * They live apart from `submit.ts` for one reason: `submit.ts` imports the scoring engine, and
 * anything that value-imports it carries the engine for all fourteen item types with it.
 * `src/lib/live/errors.ts` wants only these two strings — so that a live session's refusal and the
 * play route's refusal are worded identically — and it is on the path from a student's phone to
 * its own screen (`src/components/question/noClientScoring.test.ts` is the rule, ADR 0003 the
 * reason). Two constants should not put a scoring engine in a phone's bundle.
 *
 * `submit.ts` re-exports them, so every existing call site is unchanged.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
export const SUBMIT_ERRORS = {
  malformed: "That answer could not be read. Reload the page and try again.",
  wrongType: "That answer does not match this item. Reload the page and try again.",
} as const;
