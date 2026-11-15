import { plainStem, shorten } from "@/lib/authoring/stemExcerpt";

/** How much of a question's text a report shows beside its number (#563). */
export const QUESTION_EXCERPT_LENGTH = 60;

export interface QuestionText {
  /** About 60 characters of the question text, ending in an ellipsis when cut; "" when it has none. */
  excerpt: string;
  /** The whole question text as one line, for a tooltip and the accessible name; "" when none. */
  full: string;
}

/**
 * A question's own words for a teacher's report (#563), shown under its number, type and step
 * (#565's `questionLabel`), so a teacher can tell two questions of the same type apart. Plain text:
 * markdown marks stripped, lines joined. A question whose text could not be read gives "".
 */
export function questionText(
  stem: string | null | undefined,
  max = QUESTION_EXCERPT_LENGTH,
): QuestionText {
  const full = plainStem(stem ?? "");
  return { excerpt: shorten(full, max), full };
}
