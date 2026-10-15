import type { PreparedFile } from "../files/prepare";

/**
 * Recorded answers for #343's tests: a fictional course activity, written for these tests (no
 * real patients, and nothing taken from the owner's samples). It has the layouts #333 found in a
 * course activity: an unmarked matrix, an "Answer: ✅ B." line, an open BMI prompt, an A-I
 * matching exercise and an instructor note. The answers are what a faithful model returns.
 */

export const COURSE_ACTIVITY = `# Nutrition in Adult Health: Class Activity

Fictional content written for the LeaRN test corpus (#343). No real patients.

> Instructor note: give students 15 minutes for part one.

## Patient 1

Mr. Ortega is 78 and lives alone. He has lost 6 kg over three months.

### Question 1

For each finding, indicate whether it is consistent with malnutrition or not consistent.

| Finding | Consistent | Not consistent |
| --- | --- | --- |
| Serum albumin 2.8 g/dL | | |
| Temporal wasting | | |
| BMI 24 | | |

### Question 2

Which food should the nurse suggest first to increase Mr. Ortega's protein intake?

A. Plain white rice
B. Greek yogurt
C. Apple juice
D. Black coffee

Answer: ✅ B.

### Question 3

Calculate Mr. Ortega's BMI if he is 1.70 m tall and weighs 58 kg. Show your work.

### Question 4

Match each nutrient (A–I) with the deficiency sign it is linked to.

A. Vitamin C  B. Iron  C. Vitamin B12  D. Vitamin D  E. Zinc  F. Niacin  G. Thiamine  H. Folate  I. Vitamin A
`;

export const preparedActivity = (text = COURSE_ACTIVITY): PreparedFile => ({
  ok: true,
  kind: "md",
  sizeBytes: text.length,
  sha256: "0".repeat(64),
  pages: 1,
  images: 0,
  chunks: [{ position: 0, pageFrom: null, pageTo: null, text }],
});

const q = (fields: Record<string, unknown>) => ({
  confidence: 0.95,
  instructorNote: false,
  reliesOnImage: false,
  cutOff: false,
  continued: false,
  ...fields,
});

/** The segment answer for the activity, as one chunk. */
export const activitySegment = {
  questions: [
    q({
      excerpt:
        "For each finding, indicate whether it is consistent with malnutrition or not consistent.",
      number: "Question 1",
      type: "matrix_multiple_choice",
      instructorNote: true,
    }),
    q({
      excerpt: "Which food should the nurse suggest first to increase Mr. Ortega's protein intake?",
      number: "Question 2",
      type: "multiple_choice",
    }),
    q({
      excerpt: "Calculate Mr. Ortega's BMI if he is 1.70 m tall and weighs 58 kg.",
      number: "Question 3",
      type: "not_ngn",
      notNgnReason: "A calculation with no answer choices.",
    }),
    q({
      excerpt: "Match each nutrient (A–I) with the deficiency sign it is linked to.",
      number: "Question 4",
      type: "not_ngn",
      notNgnReason: "A matching exercise; LeaRN has no matching type.",
    }),
  ],
  answers: [],
};

export const unmarkedMatrixDraft = {
  type: "matrix_multiple_choice",
  stem: "For each finding, indicate whether it is consistent with malnutrition or not consistent.",
  columns: ["Consistent", "Not consistent"],
  rows: [
    { text: "Serum albumin 2.8 g/dL", cells: ["", ""] },
    { text: "Temporal wasting", cells: ["", ""] },
    { text: "BMI 24", cells: ["", ""] },
  ],
};

export const checkAnswerDraft = {
  type: "multiple_choice",
  stem: "Which food should the nurse suggest first to increase Mr. Ortega's protein intake?",
  options: [
    { text: "Plain white rice" },
    { text: "Greek yogurt" },
    { text: "Apple juice" },
    { text: "Black coffee" },
  ],
  answer: "Answer: ✅ B.",
};

/** The extract answer for the matrix and the multiple choice question, one call. */
export const activityExtraction = {
  question_1: { draft: unmarkedMatrixDraft, sourceErrors: [] },
  question_2: { draft: checkAnswerDraft, sourceErrors: [] },
};
