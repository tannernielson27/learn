/**
 * Loading the assignment report (#211) on the server: the page and the CSV route share this.
 *
 * Order matters. The assignment is read first, as the author under row level security, and nothing
 * else happens unless they can see it. Once it has closed, the submit at close runs for this
 * assignment (#208's `autoSubmitExpired`, as the service role) before any score is read, so an
 * attempt left open past the close is counted with what it saved. Only then are the rows read,
 * through the definer function that withholds scores until the close.
 */
import type { ReportItemInput } from "@/lib/live/report";
import type { AssignmentReportRows, ReportAssignment } from "@/lib/supabase/assignmentReport";
import { assignmentState } from "./assignments";
import { isClosed } from "./attemptPage";
import { buildAssignmentReport, type AssignmentReport } from "./report";

export interface AssignmentReportStore {
  assignment(assignmentId: string): Promise<ReportAssignment | null>;
  /** Scores and records this assignment's attempts left open at close; how many it recorded. */
  autoSubmit(assignmentId: string): Promise<number>;
  items(ids: readonly string[]): Promise<ReportItemInput[]>;
  rows(assignmentId: string): Promise<AssignmentReportRows>;
}

export interface LoadedAssignmentReport {
  assignment: ReportAssignment;
  report: AssignmentReport;
}

/** `expired_open_attempts` hands over at most this many at once. */
export const AUTO_SUBMIT_BATCH = 500;
/** 3 x 500 covers a full 1000-student roster; anything left is done by the next load or #212. */
const AUTO_SUBMIT_PASSES = 3;

async function submitAtClose(store: AssignmentReportStore, assignmentId: string): Promise<void> {
  try {
    for (let pass = 0; pass < AUTO_SUBMIT_PASSES; pass += 1) {
      if ((await store.autoSubmit(assignmentId)) < AUTO_SUBMIT_BATCH) return;
    }
  } catch (error) {
    // The report still loads: an attempt not yet submitted shows as in progress, never as a score.
    console.error("[assignment-report] the submit at close failed", {
      assignmentId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Null when the author cannot see the assignment. Throws when a read fails. */
export async function loadAssignmentReport(
  store: AssignmentReportStore,
  assignmentId: string,
  now: Date,
): Promise<LoadedAssignmentReport | null> {
  const assignment = await store.assignment(assignmentId);
  if (!assignment) return null;

  if (assignmentState(assignment.opensAt, assignment.closesAt, now) === "closed") {
    await submitAtClose(store, assignmentId);
  }

  const [items, rows] = await Promise.all([
    store.items(assignment.itemSet),
    store.rows(assignmentId),
  ]);
  // With nobody in the class the database returns no row to carry scores_released, so the
  // close itself decides, with the same grace the database uses.
  const released = rows.students.length === 0 ? isClosed(assignment.closesAt, now) : rows.released;
  return { assignment, report: buildAssignmentReport({ ...rows, released, items }) };
}
