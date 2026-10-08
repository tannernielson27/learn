/**
 * Whether `T` is plain data: strings, numbers, booleans, null, and arrays and objects of those, the
 * shape the console's `results()` and `progress()` polls carry. A Date, a Map or anything with a
 * method is not, because comparing its own fields would not say whether two of them are equal.
 */
type IsPlain<T> = T extends string | number | boolean | null | undefined
  ? true
  : T extends (...args: never[]) => unknown
    ? false
    : T extends readonly (infer E)[]
      ? IsPlain<E>
      : T extends object
        ? { [K in keyof T]-?: IsPlain<T[K]> }[keyof T] extends true
          ? true
          : false
        : false;

/** `unknown` for plain data and `never` otherwise, so a non-plain argument does not compile. */
type OnlyPlain<T> = IsPlain<T> extends true ? unknown : never;

/**
 * Whether two values say the same thing, compared exactly, field by field, all the way down (#318).
 *
 * The transport builds a fresh object on every poll, so comparing by reference re-renders the
 * results panel and the progress board every three seconds while nothing moved. This walks every
 * key of both sides rather than a hand-kept field list, so a field added to `Distribution` or
 * `SessionProgress` later is compared without anyone listing it; the `OnlyPlain` guard makes a
 * field that plain comparison could not judge (a Date, a Map) a compile error instead. Leaves are
 * compared with `===`; order matters in arrays, as it does on screen.
 */
export function sameData<T>(a: T, b: T & OnlyPlain<T>): boolean {
  return same(a, b);
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  return aKeys.every((key) => Object.hasOwn(bRecord, key) && same(aRecord[key], bRecord[key]));
}

/** A state updater that keeps the held value when `next` says the same thing, so React bails out. */
export function keepSame<T>(next: T & OnlyPlain<T>): (held: T | null) => T | null {
  return (held) => (held !== null && sameData<T>(held, next) ? held : next);
}
