import type { AttemptProgress } from "./assignments";

/** What the student home's first card needs of an open assignment. */
export interface PickUpAssignment {
  id: string;
  classId: string;
  title: string;
  closesAt: string;
  maxAttempts: number;
}

/** What it needs of a quiz shared for practice. */
export interface PickUpPractice {
  bankId: string;
  name: string;
  itemCount: number;
  answered: number;
}

export type PickUp<A extends PickUpAssignment, P extends PickUpPractice> =
  | { kind: "resume_assignment"; assignment: A }
  | { kind: "next_assignment"; assignment: A }
  | { kind: "resume_practice"; bank: P };

/**
 * The one thing the student home puts first (PLAN §4, Zeigarnik): an assignment attempt in
 * progress; else the next assignment due that the student has not started; else a practice run
 * part-way through. Read only from what the home already loads. Open assignments arrive ordered by
 * closing time, so the first match is the most urgent. Nothing is offered when nothing fits.
 */
export function pickUp<A extends PickUpAssignment, P extends PickUpPractice>(
  assignments: readonly A[] | null,
  progress: ReadonlyMap<string, AttemptProgress> | undefined,
  practice: readonly P[] | null,
): PickUp<A, P> | null {
  const open = assignments ?? [];
  const inProgress = open.find((entry) => progress?.get(entry.id)?.open === true);
  if (inProgress) return { kind: "resume_assignment", assignment: inProgress };

  const notStarted = open.find((entry) => {
    const standing = progress?.get(entry.id);
    return !standing || (!standing.open && standing.submitted === 0);
  });
  if (notStarted) return { kind: "next_assignment", assignment: notStarted };

  const underWay = (practice ?? []).find(
    (bank) => bank.answered > 0 && bank.answered < bank.itemCount,
  );
  return underWay ? { kind: "resume_practice", bank: underWay } : null;
}
