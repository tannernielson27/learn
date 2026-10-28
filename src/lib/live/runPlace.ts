/**
 * Where a position falls among the case studies a whole-quiz session plays in place (#469).
 *
 * The phone and the console ask this of every state; only the server reads the stored column
 * (`parseCaseStudyRuns` in `caseStudyRuns.ts`). The two are apart so this half imports no zod: a
 * phone that imported the parser would carry the whole schema library for one `find`
 * (`noClientZod.test.ts`).
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { EhrRecord } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";

export interface CaseStudyRun {
  caseStudyId: string;
  /** The case study's title when the session started. */
  title: string;
  /** One-based: where its step 1 sits in the session's set. */
  firstPosition: number;
  /** How many steps follow from there, step 1 included. */
  stepCount: number;
  /** Its patient record as the session started with it, whole; null when it had none. */
  record: EhrRecord | null;
}

/** Where a position falls: the case study it belongs to and the step it is. */
export interface RunPlace {
  run: CaseStudyRun;
  step: CjmmStep;
}

/** The case study and step at a one-based position, or null on a loose question or no position. */
export function runAt(runs: readonly CaseStudyRun[], position: number | null): RunPlace | null {
  if (position === null || !Number.isInteger(position)) return null;
  const run = runs.find(
    (each) => position >= each.firstPosition && position < each.firstPosition + each.stepCount,
  );
  return run === undefined ? null : { run, step: (position - run.firstPosition + 1) as CjmmStep };
}
