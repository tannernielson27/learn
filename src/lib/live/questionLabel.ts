import { plainStem, shorten } from "@/lib/authoring/stemExcerpt";

/** How much of a question's text a report shows beside its number (#563). */
export const QUESTION_EXCERPT_LENGTH = 60;

export interface QuestionLabel {
  /** "Q3": the question's place in the quiz, as the student results list writes it. */
  number: string;
  /** About 60 characters of the question text, ending in an ellipsis when cut; "" when it has none. */
  excerpt: string;
  /** The number and the whole question text, for a tooltip and the accessible name. */
  full: string;
}

/**
 * How a teacher's report names a question (#563): its number and the start of its text, the way
 * the student results list does (`QuestionResults`), never the internal `ref` an author never
 * sees. A question whose text could not be read falls back to its number alone.
 */
export function questionLabel(
  position: number,
  stem: string | null | undefined,
  max = QUESTION_EXCERPT_LENGTH,
): QuestionLabel {
  const number = `Q${position}`;
  const text = plainStem(stem ?? "");
  return {
    number,
    excerpt: shorten(text, max),
    full: text ? `${number} ${text}` : number,
  };
}
