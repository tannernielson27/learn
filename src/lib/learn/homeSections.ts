/**
 * Which parts of the student home are drawn (#563, round 3). Pure: no React, Next or Supabase.
 *
 * A part with something in it keeps its heading. A part that is empty collapses away, so a student
 * never reads a stack of "No … yet" rows. A part that did not load (`null`) stays, so its "did not
 * load" message is seen. When a student is in a class and every part loaded empty, the home shows
 * one first-use empty state in their place, which says what will appear there: assignments and
 * practice quizzes from their teacher. Joining a live session is the join code field's own line
 * at the top of the page (`STUDENT_JOIN_NOTE`), not the empty state's. A student with no class
 * sees the class code first instead (#362), not this.
 */

/** One part of the home: the rows it holds, or null when its read failed. */
export type HomePart = readonly unknown[] | null;

export interface HomeSectionsInput {
  /** The student's classes, or null when they did not load. */
  classes: HomePart;
  assignments: HomePart;
  history: HomePart;
  live: HomePart;
  practice: HomePart;
  /** Whether any clinical judgment step has an answer; null when the steps did not load. */
  stepsAnswered: boolean | null;
}

export interface HomeSections {
  assignments: boolean;
  history: boolean;
  live: boolean;
  practice: boolean;
  steps: boolean;
  /** One empty state in place of every part: in a class, and nothing anywhere yet. */
  firstUse: boolean;
}

/** Drawn when it holds a row, or when it failed and has a message to show. */
const shown = (part: HomePart): boolean => part === null || part.length > 0;

export function homeSections(input: HomeSectionsInput): HomeSections {
  const sections = {
    assignments: shown(input.assignments),
    history: shown(input.history),
    live: shown(input.live),
    practice: shown(input.practice),
    steps: input.stepsAnswered !== false,
  };
  const inAClass = input.classes !== null && input.classes.length > 0;
  const nothing = Object.values(sections).every((drawn) => !drawn);
  return { ...sections, firstUse: inAClass && nothing };
}

/** The steps as the home reads them: how many questions each step and the untagged ones hold. */
export interface StepCounts {
  steps: readonly { items: number }[];
  untagged: { items: number };
}

/** Whether any step has an answer: the same rule `YourSteps` draws its empty state by. */
export function stepsHaveAnswers(standings: StepCounts | null): boolean | null {
  if (standings === null) return null;
  return standings.untagged.items > 0 || standings.steps.some((step) => step.items > 0);
}
