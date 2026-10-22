/**
 * The answer rate on the stage's end screen (EndStage mockup, PLAN §5.11): of every answer the
 * class could have sent, how many it did, as a whole percent.
 *
 * Worked out from the tallies this screen heard, one per question. A screen opened partway
 * through has not heard them all, and a rate over part of a session would be a different
 * number with the same label, so it is then unknown and the stage leaves it out. The report has
 * the real figure.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */

/** Answers heard per position. */
export type HeardCounts = Readonly<Record<number, number>>;

export function answerRate(
  counts: HeardCounts,
  questionsRun: number,
  joined: number,
): number | null {
  if (questionsRun < 1 || joined < 1) return null;
  let sent = 0;
  for (let position = 1; position <= questionsRun; position += 1) {
    const count = counts[position];
    if (count === undefined) return null;
    sent += count;
  }
  return Math.min(100, Math.round((sent / (questionsRun * joined)) * 100));
}
