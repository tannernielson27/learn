/**
 * What the page of one assignment shows its student (#208), decided on the server.
 *
 * Everything that reaches the browser from this page is in the view this returns, so this is where
 * the promise is kept: the items are keyless (`buildAttemptSet`), the attempts carry no score (the
 * column grant has none to give), and the only answers are the student's own. The page renders the
 * view and adds nothing.
 *
 * The order matters once. An assignment whose window (and its two seconds of grace) has closed is
 * given its submit at close first — for this student and this assignment only — so that the
 * attempts read afterwards say "submitted" rather than leaving an open attempt no one can finish.
 */
import { ehrRecordSchema, type EhrRecord } from "@/lib/ngn/schemas";
import type { AttemptSummary, ExpiredFilter, StudentAssignment } from "@/lib/supabase/attempts";
import type { SetItem } from "./attemptScoring";
import { buildAttemptSet, type AttemptItemPayload } from "./attemptView";

/** The two seconds the window's SQL allows after closes_at (see the migration). */
export const CLOSE_GRACE_MS = 2000;

export interface AttemptPageStore {
  assignment(assignmentId: string): Promise<StudentAssignment | null>;
  attempts(assignmentId: string): Promise<AttemptSummary[] | null>;
  answers(attemptId: string): Promise<Record<string, unknown> | null>;
  items(ids: readonly string[]): Promise<SetItem[] | null>;
  autoSubmit(filter: ExpiredFilter): Promise<number>;
}

/** The facts about the assignment every view shows. */
export interface AssignmentHeader {
  id: string;
  title: string;
  closesAt: string;
  maxAttempts: number;
}

export type AttemptPageView =
  | { kind: "missing" }
  | { kind: "failed" }
  | {
      kind: "taking";
      assignment: AssignmentHeader;
      attempt: { id: string; number: number };
      items: AttemptItemPayload[];
      /** The case study's patient record, parsed; null for a bank. */
      record: EhrRecord | null;
    }
  | {
      kind: "summary";
      assignment: AssignmentHeader;
      attempts: AttemptSummary[];
      closed: boolean;
      /** Whether a Start (or Start attempt N) is offered. */
      canStart: boolean;
    };

export function isClosed(closesAt: string, now: Date): boolean {
  return now.getTime() > Date.parse(closesAt) + CLOSE_GRACE_MS;
}

function headerOf(assignment: StudentAssignment): AssignmentHeader {
  return {
    id: assignment.id,
    title: assignment.title,
    closesAt: assignment.closesAt,
    maxAttempts: assignment.maxAttempts,
  };
}

function recordOf(value: unknown): EhrRecord | null {
  if (value === null || value === undefined) return null;
  const parsed = ehrRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function loadAttemptPage(
  store: AttemptPageStore,
  assignmentId: string,
  studentId: string,
  now: Date,
): Promise<AttemptPageView> {
  const assignment = await store.assignment(assignmentId);
  if (assignment === null) return { kind: "missing" };

  const closed = isClosed(assignment.closesAt, now);
  if (closed) await store.autoSubmit({ assignmentId, studentId });

  const attempts = await store.attempts(assignmentId);
  if (attempts === null) return { kind: "failed" };
  const open = attempts.find((attempt) => attempt.submittedAt === null);

  if (open && !closed) {
    const [set, answers] = await Promise.all([
      store.items(assignment.itemSet),
      store.answers(open.id),
    ]);
    if (set === null || answers === null) return { kind: "failed" };
    return {
      kind: "taking",
      assignment: headerOf(assignment),
      attempt: { id: open.id, number: open.number },
      items: buildAttemptSet({
        set,
        attemptId: open.id,
        shuffle: assignment.shuffleOptions,
        answers,
      }),
      record: recordOf(assignment.patientRecord),
    };
  }

  return {
    kind: "summary",
    assignment: headerOf(assignment),
    attempts,
    closed,
    canStart: !closed && !open && attempts.length < assignment.maxAttempts,
  };
}
