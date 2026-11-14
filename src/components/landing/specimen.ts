import { formatSessionCode } from "@/lib/live/sessionCode";
import { multipleChoiceFixture } from "@/lib/ngn/fixtures/selection";
import { CJMM_STEP_LABELS } from "@/lib/ngn/types";

const question = multipleChoiceFixture.canonical;

/**
 * What the landing page's live session specimen shows (#563), taken from the gallery's multiple
 * choice fixture, whose patient is fictional. Only words are taken: the stem, the choices' labels
 * and the clinical judgment step. No id, answer key, rationale or score leaves this file, and
 * `Landing.test.tsx` checks the rendered page for every one of them.
 */
export const SPECIMEN = {
  at: 3,
  of: 20,
  step: question.cjmmStep === undefined ? null : CJMM_STEP_LABELS[question.cjmmStep],
  stem: question.stem.value,
  choices: question.content.options.map((option, index) => ({
    letter: String.fromCharCode(65 + index),
    label: option.label,
  })),
  /** A code in the join code alphabet, drawn as the projector draws one. */
  code: formatSessionCode("V96RN8"),
  joinAt: "learnursing.app/join",
  answered: 18,
  joined: 24,
  timeLeft: "0:24",
  /** How much of the timer is left, as the bar's length. */
  timeShare: 0.8,
  /** Which choice each answering phone has picked. A pick, not a mark: nothing is revealed. */
  picks: [0, 2] as const,
} as const;
