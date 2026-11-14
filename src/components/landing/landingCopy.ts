/**
 * The landing page's words (#563), in docs/glossary.md's terms. Every claim is something LeaRN
 * does today; the price facts are copied from `/pricing` (ADR 0016) and must change with it.
 * There are no quotes, school names, logos, user counts or ratings: none are true yet.
 */

export const PRICE = "$39.99";

export const PRICE_FACTS = [
  "Up to 10 teachers in one workspace",
  "A 7-day free trial",
  "Free for students",
] as const;

export const WHO_FOR = {
  eyebrow: "For nursing faculty",
  statement: "Built for nursing faculty teaching for the Next Generation NCLEX.",
  detail:
    "Students never pay. They join a live session with a join code and no account, or join your class with a free account of their own.",
} as const;

export const HOW_IT_WORKS = [
  {
    title: "Write a quiz",
    detail:
      "Write questions in every NCLEX format, in the layout your students will see on the exam.",
  },
  {
    title: "Start a live session",
    detail:
      "The projector shows the question and a join code, and you move the class on from your own screen.",
  },
  {
    title: "Students join with the join code",
    detail: "On their own phones, with no account. You see how many have answered, never who.",
  },
  {
    title: "Show the answer and review",
    detail:
      "Show the answer and its rationale to the class, then read the report by question and by clinical judgment step.",
  },
] as const;

export const FORMATS = [
  "Multiple choice",
  "Select all that apply",
  "Matrix",
  "Drop-down",
  "Highlight",
  "Drag-and-drop",
  "Ordered response",
  "Bowtie",
] as const;

export const CASE_STUDY_LINE =
  "One patient record and six questions, one for each clinical judgment step.";

export const WORK_ON_THEIR_OWN = [
  {
    term: "Assignments",
    detail: "Assign a quiz or a case study to a class, with open and due dates.",
  },
  {
    term: "Practice",
    detail:
      "Share a quiz for practice. Students open it when they like and see each answer and its rationale at once, ungraded.",
  },
] as const;
