/**
 * The shapes of a practice run as a student's browser holds it (#241), and nothing else: no
 * scoring, no key-reading code. Built on the server by `view.ts`; read by the player.
 */
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { KeylessItem, Reveal, ScoreReveal } from "@/lib/ngn/submit";

/** How an answered item reopens: with its marks, or (a stored answer that no longer parses) its key. */
export type PracticeAnswered =
  { kind: "scored"; response: AnyResponse; reveal: ScoreReveal } | { kind: "key"; key: Reveal };

export interface PracticeItemEntry {
  /** The item's row id: what an answer names it by. */
  itemId: string;
  item: KeylessItem;
  answered: PracticeAnswered | null;
  /**
   * Only in a run of the questions a student missed: a case study's step played on its own, with
   * the patient record as it stood at that step and a line naming the case study and the step.
   * The source already showed the student that step and its chart.
   */
  record?: EhrRecordView;
  context?: string;
}

/**
 * A case study as far as this run has reached it (#335): the steps up to and including the first
 * one not yet answered, and the patient record's view at each of them, step 1 first. A step past
 * that, and its chart, are not in the payload at all; they arrive on the next read of the page,
 * once the step before them has been answered.
 */
export interface PracticeCaseStudyEntry {
  kind: "case_study";
  id: string;
  title: string;
  /** `recordAtStep` at step 1, 2, ... one per reached step, in step order. */
  records: EhrRecordView[];
  /** The reached steps, in step order. */
  steps: PracticeItemEntry[];
  /** How many steps the case study has, reached or not. */
  stepCount: number;
}

export type PracticeEntry = ({ kind: "item" } & PracticeItemEntry) | PracticeCaseStudyEntry;

export interface PracticeView {
  runId: string;
  bankName: string;
  /**
   * `quiz` for a run of a shared quiz; `missed` for a run of only the questions missed in an
   * earlier run or an assignment, which has no Start over of its own.
   */
  kind?: "quiz" | "missed";
  /** Items and case-study steps in the run. */
  total: number;
  answered: number;
  entries: PracticeEntry[];
}

/** How many items an entry counts for: one, or every step of a case study, reached or not. */
export function sizeOf(entry: PracticeEntry): number {
  return entry.kind === "item" ? 1 : entry.stepCount;
}

/** Every item of an entry that is in the payload: the item itself, or a case study's reached steps. */
export function itemsOf(entry: PracticeEntry): PracticeItemEntry[] {
  return entry.kind === "item" ? [entry] : entry.steps;
}
