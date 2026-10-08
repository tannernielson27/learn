import type { ItemAggregate } from "@/lib/live";

/**
 * Every field of a tally. A `Record` over `keyof ItemAggregate`, so a field added to the interface
 * does not compile until it is listed here, and `sameTally` cannot silently skip it.
 */
const FIELDS: Record<keyof ItemAggregate, true> = {
  itemId: true,
  position: true,
  present: true,
  responded: true,
  fullMarks: true,
  partialMarks: true,
  noMarks: true,
  meanPoints: true,
  maxPoints: true,
};
const KEYS = Object.keys(FIELDS) as (keyof ItemAggregate)[];

/**
 * Whether two tallies say the same thing, field by field (#298).
 *
 * The transport builds a fresh object on every poll, so comparing by reference would re-render the
 * whole console every three seconds while nothing moved. Every field is a string or a number, so
 * `===` on each is exact.
 */
export function sameTally(a: ItemAggregate | null, b: ItemAggregate | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return KEYS.every((key) => a[key] === b[key]);
}

/** A state updater that keeps the held tally when `next` says the same thing, so React bails out. */
export function keepTally(
  next: ItemAggregate,
): (held: ItemAggregate | null) => ItemAggregate | null {
  return (held) => (sameTally(held, next) ? held : next);
}
