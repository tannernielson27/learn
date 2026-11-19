/**
 * Cutting a document's text to a length (#593). JavaScript counts a string in UTF-16 units, and a
 * character outside the basic plane (an emoji, some symbols) takes two. A plain `slice` can end
 * between the two, leaving half a character: Postgres refuses that in `text` and in JSON, and
 * the whole insert fails. Every cut of a source or an excerpt goes through here instead.
 */

const isHigh = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLow = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

/** The first `max` units of `text`, or one fewer when that would split a character. */
export function cutEnd(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 0) return "";
  return text.slice(0, isHigh(text.charCodeAt(max - 1)) ? max - 1 : max);
}

/** The last `max` units of `text`, or one fewer when that would split a character. */
export function cutStart(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 0) return "";
  const start = text.length - max;
  return text.slice(isLow(text.charCodeAt(start)) ? start + 1 : start);
}

/**
 * `text` in at most `max` units, with its middle taken out and `marker` in its place. A question
 * opens with its stem and ends with its options and its answer line, so those are what is kept.
 */
export function cutMiddle(text: string, max: number, marker: string): string {
  if (text.length <= max) return text;
  const room = max - marker.length;
  if (room <= 0) return cutEnd(text, max);
  const head = Math.ceil(room * 0.6);
  return cutEnd(text, head) + marker + cutStart(text, room - head);
}

/**
 * How much of each part may be kept when together they must fit `total`: a part shorter than an
 * even share keeps everything, and what it does not use goes to the longer ones.
 */
export function shareBudget(lengths: readonly number[], total: number): number[] {
  const shortestFirst = lengths.map((_, index) => index).sort((a, b) => lengths[a]! - lengths[b]!);
  const budget = lengths.map(() => 0);
  let left = total;
  shortestFirst.forEach((index, turn) => {
    const share = Math.floor(left / (lengths.length - turn));
    budget[index] = Math.min(lengths[index]!, share);
    left -= budget[index]!;
  });
  return budget;
}
