/**
 * The learn.v1 import limits and messages, kept apart from `transfer.ts` so client components can
 * read them without bundling zod and the ngn schemas (#294). `transfer.ts` re-exports them.
 */

/** Below the default 1 MB Server Action body limit, with room for the form around it. */
export const IMPORT_MAX_BYTES = 800_000;
export const IMPORT_MAX_ITEMS = 50;

export const IMPORT_ERRORS = {
  tooLarge: "This import is too large. Import at most 800 KB at a time.",
  notJson: "This is not valid JSON.",
  notLearn: 'This is not a LeaRN export. It needs "format": "learn.v1".',
  eitherOr: "A LeaRN export holds either items or one case study.",
  itemCount: `Include between 1 and ${IMPORT_MAX_ITEMS} items. Split a larger set into several files.`,
} as const;
