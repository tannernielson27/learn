/**
 * A student's steps from their closed assignments (#239). The database hands over every submitted
 * attempt at a closed assignment with its marks (`public.my_step_marks`); this keeps only the best
 * attempt of each, by the same `pickBestAttempt` as #210, #211 and #238 (owner decision
 * 2026-09-23), and hands its marks to `buildStepStandings` as the "assignments" source.
 *
 * Practice (#241) adds its own marks with `source: "practice"` beside these: each item's first
 * practice answer (`public.my_practice_step_marks`), ranked together with the assignments and
 * counted apart, as #239 designed.
 */
import { buildStepStandings, type StepMark, type StepStandings } from "@/lib/ngn/stepStandings";
import type { StepAttempt, StepAttemptMark } from "@/lib/supabase/steps";
import { pickBestAttempt } from "./report";

function byAssignment(attempts: readonly StepAttempt[]): StepAttempt[][] {
  const grouped = new Map<string, StepAttempt[]>();
  for (const attempt of attempts) {
    grouped.set(attempt.assignmentId, [...(grouped.get(attempt.assignmentId) ?? []), attempt]);
  }
  return [...grouped.values()];
}

/** The best attempt's marks at each closed assignment. */
export function assignmentStepMarks(attempts: readonly StepAttempt[]): StepMark[] {
  return byAssignment(attempts).flatMap((group) =>
    (pickBestAttempt(group)?.marks ?? []).map((mark): StepMark => ({
      source: "assignments",
      cjmmStep: mark.cjmmStep,
      points: mark.points,
      maxPoints: mark.maxPoints,
    })),
  );
}

/** Practice marks (#241), as the practice source. */
export function practiceStepMarks(marks: readonly StepAttemptMark[]): StepMark[] {
  return marks.map((mark) => ({
    source: "practice",
    cjmmStep: mark.cjmmStep,
    points: mark.points,
    maxPoints: mark.maxPoints,
  }));
}

export function buildMyStepStandings(
  attempts: readonly StepAttempt[],
  practice: readonly StepAttemptMark[] = [],
): StepStandings {
  return buildStepStandings([...assignmentStepMarks(attempts), ...practiceStepMarks(practice)]);
}
