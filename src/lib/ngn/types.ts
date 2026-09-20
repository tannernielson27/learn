/**
 * Shared types for the pure NGN core. No React, Next, or Supabase imports allowed here.
 */

export type CjmmStep = 1 | 2 | 3 | 4 | 5 | 6;

export const CJMM_STEP_LABELS: Record<CjmmStep, string> = {
  1: "Recognize Cues",
  2: "Analyze Cues",
  3: "Prioritize Hypotheses",
  4: "Generate Solutions",
  5: "Take Action",
  6: "Evaluate Outcomes",
};

/** Tag on demo content written for this repo; the player labels such items "Sample". */
export const SAMPLE_TAG = "sample";

export type ScoringModel = "zero_one" | "plus_minus" | "rationale";

export interface ScoreBreakdownEntry {
  /** Stable id of the scored element (option, row, blank, slot). */
  elementId: string;
  /** Human label for feedback UI, when known. */
  label?: string;
  /** Whether this element was answered correctly. */
  correct: boolean;
  /** Points contributed by this element (may be negative under +/- before flooring). */
  delta: number;
}

/**
 * What one group of an item earned. A group is whatever the item scores a row at a time: a matrix
 * row, a grouping row, a highlight table row. Renderers show these beside the row; they exist so
 * that no renderer has to re-derive points from the answer key (ADR 0003).
 */
export interface ScoreGroup {
  /** Stable id of the group, matching the row id the renderer draws. */
  groupId: string;
  points: number;
  maxPoints: number;
}

export interface ScoreResult {
  points: number;
  maxPoints: number;
  model: ScoringModel;
  breakdown: ScoreBreakdownEntry[];
  /** Per-row subtotals, present only for items that score row by row. */
  groups?: ScoreGroup[];
}

export interface ScorableElement {
  id: string;
  label?: string;
  correct: boolean;
}

export class ScoringError extends Error {
  readonly code: "type_mismatch" | "invalid_response";
  constructor(code: ScoringError["code"], message: string) {
    super(message);
    this.name = "ScoringError";
    this.code = code;
  }
}
