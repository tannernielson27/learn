/**
 * The case studies a whole-quiz session plays in place (#469), as the session snapshotted them.
 *
 * A session run from a quiz plays each ready case study at its place in the quiz order, as its
 * steps. `sessions.case_study_records` says which positions of the set are whose steps, and holds
 * each case study's patient record as it was when the room opened (migration
 * `20261022000000_quiz_case_studies_live.sql`). This reads that column and answers the one
 * question every screen asks of it: at this position, which case study, and which step?
 *
 * The step a position is at is its offset from the case study's first position, plus one: the
 * rule a session run from one case study already reads its record by (`stepAtPosition`).
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { z } from "zod";
import { CASE_STUDY_STEP_COUNT, ehrRecordSchema, type EhrRecord } from "@/lib/ngn/schemas";
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

const storedRunSchema = z.object({
  case_study_id: z.string().min(1),
  title: z.string(),
  first_position: z.number().int().min(1),
  step_count: z.number().int().min(1).max(CASE_STUDY_STEP_COUNT),
  record: z.unknown(),
});

/**
 * The stored column, read as runs in set order. Stored JSON is external input: an entry that does
 * not describe a place in the set is dropped, a record that does not parse is no record, and the
 * record schema drops any key it does not define. Runs never overlap: the database writes none
 * that do, and if one ever did, the earlier run keeps the positions it claims.
 */
export function parseCaseStudyRuns(value: unknown): CaseStudyRun[] {
  if (!Array.isArray(value)) return [];
  const runs = value.flatMap((entry): CaseStudyRun[] => {
    const parsed = storedRunSchema.safeParse(entry);
    if (!parsed.success) return [];
    const record = ehrRecordSchema.safeParse(parsed.data.record);
    return [
      {
        caseStudyId: parsed.data.case_study_id,
        title: parsed.data.title,
        firstPosition: parsed.data.first_position,
        stepCount: parsed.data.step_count,
        record: record.success ? record.data : null,
      },
    ];
  });
  runs.sort((a, b) => a.firstPosition - b.firstPosition);
  let covered = 0;
  return runs.filter((run) => {
    if (run.firstPosition <= covered) return false;
    covered = run.firstPosition + run.stepCount - 1;
    return true;
  });
}

/** The case study and step at a one-based position, or null on a loose question or no position. */
export function runAt(runs: readonly CaseStudyRun[], position: number | null): RunPlace | null {
  if (position === null || !Number.isInteger(position)) return null;
  const run = runs.find(
    (each) => position >= each.firstPosition && position < each.firstPosition + each.stepCount,
  );
  return run === undefined ? null : { run, step: (position - run.firstPosition + 1) as CjmmStep };
}
