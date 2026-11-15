import type { CaseStudySummary, ItemSummary } from "./banks";
import type { TaggedRow } from "./tagFilter";

/**
 * One quiz for `/gallery/quiz-page` (#563): question summaries with fictional stems, as the quiz
 * page lists them, so the screenshot suite and the #563 review can see the page with no database.
 * A summary carries no answer key, rationale or scoring rule; nothing here is or holds one.
 */

export const QUIZ_FIXTURE_ID = "00000000-0000-4000-8000-0000000002b1";
export const QUIZ_FIXTURE_NAME = "Cardiac week: heart failure and dysrhythmias";

const EDITED = "2026-11-12T15:00:00Z";

const summary = (
  index: number,
  stemExcerpt: string,
  over: Partial<ItemSummary> = {},
): ItemSummary => ({
  id: `00000000-0000-4000-8000-0000000002${String(index).padStart(2, "0")}`,
  type: "multiple_choice",
  status: "published",
  stemExcerpt,
  maxPoints: 1,
  updatedAt: EDITED,
  cjmmStep: null,
  tags: [],
  match: null,
  warningCount: 0,
  ...over,
});

export const QUIZ_FIXTURE_ITEMS: readonly ItemSummary[] = [
  summary(1, "A client with heart failure gained 2 kg overnight. Which action comes first?", {
    cjmmStep: 1,
    tags: ["Physiological Adaptation", "heart failure"],
  }),
  summary(2, "Which findings are expected after a dose of furosemide? Select all that apply.", {
    type: "multiple_response",
    maxPoints: 4,
    tags: ["Pharmacological Therapies"],
  }),
  summary(3, "For each finding, choose whether it suggests worsening heart failure.", {
    type: "matrix_multiple_choice",
    maxPoints: 5,
    cjmmStep: 2,
    tags: ["heart failure"],
  }),
  summary(4, "", { status: "draft", maxPoints: null, warningCount: 1 }),
  summary(5, "Put the steps for applying telemetry leads in order.", {
    type: "ordered_response",
    status: "draft",
    maxPoints: 1,
    warningCount: 2,
  }),
  summary(6, "Which rhythm strip shows atrial fibrillation?", { cjmmStep: 3 }),
];

export const QUIZ_FIXTURE_CASE_STUDIES: readonly CaseStudySummary[] = [
  {
    id: "00000000-0000-4000-8000-0000000002c1",
    title: "Mr. Okafor, decompensated heart failure",
    status: "draft",
    stepCount: 4,
    updatedAt: EDITED,
  },
];

/** The tags behind the Filters panel's chips, one row per question above. */
export const QUIZ_FIXTURE_TAGGED: readonly TaggedRow[] = QUIZ_FIXTURE_ITEMS.map((item) => ({
  cjmmStep: item.cjmmStep,
  tags: item.tags,
  hasWarnings: item.warningCount > 0,
}));

export const QUIZ_FIXTURE_CLASSES = [
  { id: "00000000-0000-4000-8000-0000000002d1", name: "NUR 310" },
  { id: "00000000-0000-4000-8000-0000000002d2", name: "NUR 420" },
] as const;
