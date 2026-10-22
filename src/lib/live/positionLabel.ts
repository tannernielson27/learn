/**
 * Where the room is, in the words the host console shows (#184).
 *
 * A quiz says "Question 3 of 10" (docs/glossary.md). A case study is six clinical judgment
 * steps, and the steps are what is being taught, so its console names the one the room is on:
 * "Step 2 of 6: Analyze Cues" — the same words `StepIndicator` puts above a case study played
 * alone. The step comes from the item's own `cjmmStep`; until the item has arrived it is the
 * position, because a case study's steps are the six CJMM steps in order (`caseStudySchema`).
 *
 * A quiz that plays case studies in place (#469) says both: "Question 9 of 14 · Step 2 of 6:
 * Analyze Cues", the place in the quiz and the place in the case study.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import type { LiveSessionState } from "./state";

export interface PositionContext {
  /** Whether the session was started from a case study. */
  caseStudy: boolean;
  /** The current item's CJMM step, or null when it has none or has not arrived. */
  cjmmStep: number | null;
  /**
   * In a quiz that plays case studies in place (#469), where the room is in the case study whose
   * step it is on (`runAt`): its step, counted from the case study's first position, of how many.
   * Null or absent on a loose question.
   */
  run?: { step: number; stepCount: number } | null;
}

function stepName(step: number): string | null {
  return step in CJMM_STEP_LABELS ? CJMM_STEP_LABELS[step as CjmmStep] : null;
}

/** "Question 3 of 10", "Step 2 of 6: Analyze Cues", or null when the room is on no item. */
export function positionLabel(state: LiveSessionState, context: PositionContext): string | null {
  if (state.position === null || state.itemCount < 1) return null;
  const where = `${state.position} of ${state.itemCount}`;
  if (context.run) {
    const { step, stepCount } = context.run;
    const name = stepName(context.cjmmStep ?? step);
    const inCase = `Step ${step} of ${stepCount}`;
    return `Question ${where} · ${name === null ? inCase : `${inCase}: ${name}`}`;
  }
  if (!context.caseStudy) return `Question ${where}`;
  const name = stepName(context.cjmmStep ?? state.position);
  return name === null ? `Step ${where}` : `Step ${where}: ${name}`;
}
