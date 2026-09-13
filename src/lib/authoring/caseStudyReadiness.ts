import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";

/** One of a case study's six positions, as the builder sees it. */
export interface CaseStudyStepState {
  position: CjmmStep;
  /** The item placed at this position, or null while the step is empty. */
  itemId: string | null;
  /** Whether that item passes its own schema and is published. False for an empty step. */
  itemReady: boolean;
  /** The placed item's CJMM step differs from this position, so the case study would not validate. */
  wrongStep?: boolean;
}

export interface CaseStudyReadinessInput {
  titleWritten: boolean;
  recordTabCount: number;
  steps: readonly CaseStudyStepState[];
}

const POSITIONS: readonly CjmmStep[] = [1, 2, 3, 4, 5, 6];

const stepName = (position: CjmmStep) => `Step ${position} (${CJMM_STEP_LABELS[position]})`;

/** Publishing needs every step item published; previewing only needs each one finished. */
export type ReadinessPurpose = "publish" | "preview";

/**
 * Why a case study cannot be published (or previewed) yet, in plain language, one reason per
 * problem and in the order an author would fix them. An empty list means it is ready. Publish
 * still validates the whole case study against its schema on the server; this is what the builder
 * shows first.
 */
export function caseStudyBlockers(
  input: CaseStudyReadinessInput,
  purpose: ReadinessPurpose = "publish",
): string[] {
  const reasons: string[] = [];
  if (!input.titleWritten) reasons.push("Give the case study a title.");
  if (input.recordTabCount < 1) reasons.push("Add at least one tab to the patient record.");

  const byPosition = new Map(input.steps.map((step) => [step.position, step]));
  for (const position of POSITIONS) {
    const step = byPosition.get(position);
    if (!step || step.itemId === null) {
      reasons.push(`${stepName(position)} has no item yet.`);
    } else if (step.wrongStep) {
      reasons.push(
        `${stepName(position)}'s item is set to a different clinical judgment step. Place it again.`,
      );
    } else if (!step.itemReady) {
      reasons.push(
        purpose === "preview"
          ? `${stepName(position)} needs its item finished.`
          : `${stepName(position)} needs its item finished and published.`,
      );
    }
  }
  return reasons;
}

/** "4 of 6 steps ready", for the builder's progress line. */
export function stepsReadyLabel(steps: readonly CaseStudyStepState[]): string {
  const ready = new Set(
    steps
      .filter((step) => step.itemId !== null && step.itemReady && !step.wrongStep)
      .map((step) => step.position),
  ).size;
  return `${ready} of 6 steps ready`;
}
