/**
 * A student's history on their home page (#238): each closed assignment in their current classes,
 * with their best score and the attempts they used.
 *
 * The order is the rule, as on #210's results page:
 *
 *   1. The submit at close for this student (#208's `autoSubmitExpired`), so an attempt left open
 *      is marked with what it saved before anything is read.
 *   2. The history, through `public.my_assignment_history` as the student. It lists an assignment
 *      only once it has closed by the database's clock (with the two seconds of grace), and only the
 *      caller's own attempts.
 *
 * The best attempt counts (owner decision 2026-09-23): `bestAttemptOf`, the same rule as #210 and
 * #211 — the highest total, a tie to the earlier attempt, and only a submitted attempt.
 *
 * The same submit at close comes before "Your steps" (#239), read beside the history through
 * `public.my_step_marks`, under the same rules, and ranked by `buildMyStepStandings`.
 */
import type { ExpiredFilter } from "@/lib/supabase/attempts";
import type { StepStandings } from "@/lib/ngn/stepStandings";
import type { HistoryAssignment } from "@/lib/supabase/history";
import type { StepAttempt } from "@/lib/supabase/steps";
import { bestAttemptOf, type BestAttempt } from "./report";
import { buildMyStepStandings } from "./steps";

export interface HistoryStore {
  /** The submit at close, narrowed to this student. */
  autoSubmit(filter: ExpiredFilter): Promise<number>;
  /** The student's closed assignments with their own attempts, as the student. Null on an error. */
  history(): Promise<HistoryAssignment[] | null>;
  /** The student's submitted attempts at closed assignments with their marks (#239). Null on an error. */
  stepAttempts(): Promise<StepAttempt[] | null>;
}

/** How the student stands on one closed assignment. */
export type HistoryStanding =
  | { kind: "not_attempted" }
  /** Attempts, but none with a score: the submit at close has not reached them yet. */
  | { kind: "unmarked" }
  | { kind: "scored"; best: BestAttempt };

export interface HistoryRow {
  id: string;
  classId: string;
  title: string;
  closesAt: string;
  maxAttempts: number;
  attemptsUsed: number;
  standing: HistoryStanding;
}

/** One student has at most one open attempt per assignment, so a small batch covers them all. */
export const HISTORY_AUTO_SUBMIT_BATCH = 50;

function standingOf(entry: HistoryAssignment): HistoryStanding {
  if (entry.attempts.length === 0) return { kind: "not_attempted" };
  const best = bestAttemptOf(entry.attempts);
  return best ? { kind: "scored", best } : { kind: "unmarked" };
}

export function buildHistory(assignments: readonly HistoryAssignment[]): HistoryRow[] {
  return assignments.map((entry) => ({
    id: entry.id,
    classId: entry.classId,
    title: entry.title,
    closesAt: entry.closesAt,
    maxAttempts: entry.maxAttempts,
    attemptsUsed: entry.attempts.length,
    standing: standingOf(entry),
  }));
}

async function submitAtClose(store: HistoryStore, studentId: string): Promise<void> {
  try {
    await store.autoSubmit({ studentId, limit: HISTORY_AUTO_SUBMIT_BATCH });
  } catch (error) {
    // The page still loads: an attempt not yet submitted shows as not marked, never as a score.
    console.error("[student-history] the submit at close failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** What the student home shows of past work; each part is null when its read failed. */
export interface StudentRecord {
  history: HistoryRow[] | null;
  steps: StepStandings | null;
}

export async function loadStudentRecord(
  store: HistoryStore,
  studentId: string,
): Promise<StudentRecord> {
  await submitAtClose(store, studentId);
  const [assignments, attempts] = await Promise.all([store.history(), store.stepAttempts()]);
  return {
    history: assignments === null ? null : buildHistory(assignments),
    steps: attempts === null ? null : buildMyStepStandings(attempts),
  };
}
