/**
 * What the landing page's picture of a live session shows (#563): one gallery question as the
 * projector draws it while answers come in. It is read through the projector's own narrow door
 * (`stageQuestion`): the question text and each option's words, never the key or the rationale,
 * so nothing that marks an answer can reach this page's HTML or payload (`noKey.test.tsx`).
 *
 * The patient is the gallery's, and fictional.
 */
import { stageQuestion, type StageOption } from "@/components/live/stage/stageItem";
import { multipleChoiceFixture } from "@/lib/ngn/fixtures/selection";
import { CJMM_STEP_LABELS } from "@/lib/ngn/types";
import type { Item } from "@/lib/ngn/schemas";

/** The gallery item behind the picture. Exported for the test that proves its key stays out. */
export const DEMO_ITEM = multipleChoiceFixture.canonical;

export interface LiveDemo {
  stem: string;
  options: readonly StageOption[];
  /** "Question 3 of 20 · Take Action" */
  place: string;
  /** A join code drawn from the real alphabet, for the strip. */
  code: string;
  url: string;
  answered: number;
  present: number;
  /** Time left, as the projector writes it. */
  timeLeft: string;
  /** How much of the clock is left, 0 to 1, for the bar. */
  timeShare: number;
  /** Which option each picture phone has chosen: a student's choice, never a mark. */
  phones: readonly { pick: number | null; sent: boolean }[];
}

function demo(): LiveDemo {
  // The fixture is a complete item, so it is one as far as the projector's door is concerned.
  const question = stageQuestion(DEMO_ITEM as Item);
  if (question === null || question.options === null) {
    throw new Error("The landing picture needs a lettered question.");
  }
  const step = DEMO_ITEM.cjmmStep;
  return {
    stem: question.stem.value,
    options: question.options,
    place: `Question 3 of 20${step === undefined ? "" : ` · ${CJMM_STEP_LABELS[step]}`}`,
    code: "V96RN8",
    url: "learnursing.app/join",
    answered: 18,
    present: 24,
    timeLeft: "0:24",
    timeShare: 0.8,
    phones: [
      { pick: 0, sent: false },
      { pick: 2, sent: false },
      { pick: 1, sent: true },
    ],
  };
}

export const LIVE_DEMO: LiveDemo = demo();
