/**
 * "Practise the N I missed" (owner decision 6; 20261023020000_practice_missed.sql), decided on the
 * server.
 *
 * The browser names only the source: the practice run it just finished, or the assignment whose
 * results it is showing. Which questions were missed is worked out here, from the server's own
 * read of that source, and the database checks the list again against the same source before it
 * starts a run. Practice is never graded, and nothing here writes to an assignment.
 *
 *   - In a practice run, a missed question is one answered below full marks. One not answered is
 *     not missed: its key, and for a case study step its chart, have not been shown yet.
 *   - In an assignment's results, it is any question the counted attempt did not mark at full
 *     marks, blank ones included. An answer that can no longer be drawn is left out, because what
 *     it scored cannot be told.
 *
 * Full marks is the line the player's "All correct" draws: a maximum above nought, reached.
 *
 * Server only: it reaches the results loader, which reaches the scoring seam.
 */
import type { ResultEntry, ResultsView } from "@/lib/assignments/results";
import type { RateLimitStore } from "@/lib/rateLimit/store";
import type { MissedStart } from "@/lib/supabase/practiceMissed";
import type { RunSlots } from "./answerRoute";
import { PRACTICE_START_LIMIT, takePracticeLimit } from "./limits";
import type { PracticeSlot } from "./view";

export interface RunMark {
  points: number;
  maxPoints: number;
}

export const isFullMarks = ({ points, maxPoints }: RunMark): boolean =>
  maxPoints > 0 && points >= maxPoints;

/** A run's questions answered below full marks, in play order. */
export function missedInRun(
  slots: readonly PracticeSlot[],
  marks: ReadonlyMap<string, RunMark>,
): string[] {
  return slots.flatMap((slot) => {
    const mark = marks.get(slot.itemId);
    return mark && !isFullMarks(mark) ? [slot.itemId] : [];
  });
}

/** Whether a result counts as missed: anything short of full marks that can still be read. */
export function isMissedResult(entry: Pick<ResultEntry, "outcome">): boolean {
  const { outcome } = entry;
  if (outcome.kind === "unreadable") return false;
  if (outcome.kind !== "answered") return true;
  return !isFullMarks(outcome.score);
}

/** An assignment's missed questions, in the assignment's order. */
export function missedInResults(entries: readonly ResultEntry[]): string[] {
  return entries.filter(isMissedResult).map((entry) => entry.rowId);
}

export type MissedSourceRef =
  { kind: "run"; runId: string } | { kind: "assignment"; assignmentId: string };

export interface MissedStore {
  /** The run's questions, when it is live for the student. */
  slots(student: string, runId: string): Promise<RunSlots | null>;
  /** The run's marks by question. Read only after `slots` found the run live. */
  marks(runId: string): Promise<ReadonlyMap<string, RunMark> | null>;
  fromRun(student: string, runId: string, itemIds: readonly string[]): Promise<MissedStart>;
  /** The student's own results page, by its own rules (released only after the close). */
  results(student: string, assignmentId: string): Promise<ResultsView>;
  fromAssignment(
    student: string,
    assignmentId: string,
    itemIds: readonly string[],
    bestAttemptId: string | null,
  ): Promise<MissedStart>;
}

export type StartMissedOutcome =
  { kind: "started"; runId: string } | { kind: "rate_limited" | "not_found" | "empty" | "failed" };

function settled(start: MissedStart): StartMissedOutcome {
  if (start.ok) return { kind: "started", runId: start.runId };
  // The list was worked out from the same source a moment ago; a refusal of it means the source
  // changed under us, which is a failure to try again, not something the student did.
  if (start.reason === "invalid") return { kind: "failed" };
  return { kind: start.reason };
}

async function fromRun(
  store: MissedStore,
  student: string,
  runId: string,
): Promise<StartMissedOutcome> {
  const listed = await store.slots(student, runId);
  if (listed === null) return { kind: "failed" };
  if (listed.slots.length === 0) return { kind: "not_found" };
  const marks = await store.marks(runId);
  if (marks === null) return { kind: "failed" };
  const missed = missedInRun(listed.slots, marks);
  if (missed.length === 0) return { kind: "empty" };
  return settled(await store.fromRun(student, runId, missed));
}

async function fromAssignment(
  store: MissedStore,
  student: string,
  assignmentId: string,
): Promise<StartMissedOutcome> {
  const view = await store.results(student, assignmentId);
  if (view.kind === "failed") return { kind: "failed" };
  if (view.kind !== "results") return { kind: "not_found" };
  const missed = missedInResults(view.entries);
  if (missed.length === 0) return { kind: "empty" };
  return settled(await store.fromAssignment(student, assignmentId, missed, view.bestAttemptId));
}

/** Starts a run of the missed questions. Counted against `practice_start`, failing open. */
export async function startMissedPractice(
  store: MissedStore,
  limiter: RateLimitStore,
  student: string,
  source: MissedSourceRef,
): Promise<StartMissedOutcome> {
  if (!(await takePracticeLimit(limiter, "practice_start", student, PRACTICE_START_LIMIT))) {
    return { kind: "rate_limited" };
  }
  return source.kind === "run"
    ? fromRun(store, student, source.runId)
    : fromAssignment(store, student, source.assignmentId);
}

/** What the student is told when no run started. */
export const MISSED_REFUSALS: Record<Exclude<StartMissedOutcome["kind"], "started">, string> = {
  rate_limited: "You are starting practice very quickly. Wait a minute, then try again.",
  not_found: "These questions are no longer open to you. Go back to your classes.",
  empty: "You did not miss any questions here.",
  failed: "Practice could not start. Try again.",
};
