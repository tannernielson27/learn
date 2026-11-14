import { stageQuestion, type StageQuestion } from "@/components/live/stage/stageItem";
import { formatSessionCode } from "@/lib/live/sessionCode";
import { multipleChoiceFixture } from "@/lib/ngn/fixtures/selection";
import { itemSchema } from "@/lib/ngn/schemas";

/**
 * What the landing page's drawing of a live session shows (#563), from the gallery's own
 * multiple choice fixture: the heart failure question the stage and phone mockups use. Its client
 * is fictional and unnamed.
 *
 * Read through the projector's narrow door (`stageQuestion`): the question text and each option's
 * words in order, never the key or the rationale. Only these strings reach the page, and
 * `Landing.test.tsx` checks the rendered page for the fixture's key and rationale.
 */
export interface LiveClassDemo {
  /** Where the room is, as the stage strip says it. */
  place: string;
  /** The join code as the projector shows it, two groups of three. */
  code: string;
  /** The join address on the stage, without the scheme. */
  url: string;
  /** The question's clock, as words. */
  clock: string;
  question: StageQuestion & { options: NonNullable<StageQuestion["options"]> };
  /** The count before the drawing plays, and where it settles. */
  answeredBefore: number;
  answered: number;
  present: number;
  /** The letters the drawn phones have picked: one still choosing, one sent. */
  chosen: string;
  sent: string;
}

function demoQuestion(): LiveClassDemo["question"] {
  const question = stageQuestion(itemSchema.parse(multipleChoiceFixture.canonical));
  if (question === null || question.options === null) {
    throw new Error("The landing page's live session needs a lettered question.");
  }
  return { stem: question.stem, options: question.options };
}

export const LIVE_CLASS_DEMO: LiveClassDemo = {
  place: "Question 3 of 10",
  // From the QuestionStage mockup; every character is in the join code alphabet.
  code: formatSessionCode("V96RN8"),
  url: "learnursing.app/join",
  clock: "0:24",
  question: demoQuestion(),
  answeredBefore: 15,
  answered: 18,
  present: 24,
  chosen: "A",
  sent: "C",
};
