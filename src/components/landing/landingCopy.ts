import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";

/**
 * The landing page's words (#563), each a thing LeaRN does today, in docs/glossary.md's terms.
 * No testimonial, school, logo, count or rating: there are none to show yet.
 */

/** How a teacher uses it, in the order it happens. */
export const HOW_IT_WORKS = [
  {
    title: "Write or import a quiz",
    text: "Write questions in the layout students will see, or import the questions you already have.",
  },
  {
    title: "Start a live session",
    text: "Put the projector view on the screen at the front of the class. It shows the join code.",
  },
  {
    title: "Students join with a code",
    text: "They type the join code on their phones and answer. No account needed.",
  },
  {
    title: "Reveal and review",
    text: "Reveal the answer when you are ready and talk it through. Each live session leaves a report.",
  },
] as const;

/** Every NCLEX question format, with what a student does in it. */
export const FORMATS = [
  { name: "Multiple choice", does: "Choose the one best answer." },
  { name: "Select all that apply", does: "Choose every answer that applies." },
  { name: "Matrix", does: "Choose an answer in each row of a table." },
  { name: "Drop-down", does: "Complete a sentence or a table from drop-down lists." },
  { name: "Highlight", does: "Select the findings in a passage that matter." },
  { name: "Drag-and-drop", does: "Drag choices into the blanks." },
  { name: "Ordered response", does: "Put the steps in order." },
  { name: "Bowtie", does: "Choose the condition, two actions and two things to monitor." },
] as const;

/** The six clinical judgment steps a case study walks through, in the player's own words. */
export const CASE_STEPS = ([1, 2, 3, 4, 5, 6] as const).map(
  (step: CjmmStep) => CJMM_STEP_LABELS[step],
);

/** The other ways to use a quiz. */
export const ALSO = [
  {
    term: "Assignments",
    detail: "Assign a quiz to a class, with open and due dates, scored the same way.",
  },
  {
    term: "Practice",
    detail: "Share a quiz for practice. Students see each answer and rationale at once.",
  },
] as const;
