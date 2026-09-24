/**
 * The assignment report (#211): how a class did on an assignment, by student, by item and by CJMM
 * step. Pure: no React, no Next, no Supabase.
 *
 * It is the live session report (#186) run over each student's best attempt. Owner decision
 * 2026-09-23: the best attempt counts — the highest total, a tie going to the earlier attempt, and
 * only a submitted attempt can be best. `buildSessionReport` does the per-item and per-step
 * arithmetic unchanged; this adds the attempt bookkeeping and a percent correct per item.
 *
 * While the assignment is open the report is progress only. The database already withholds every
 * score before the close (`public.assignment_report_rows`); `released: false` drops any score it
 * is handed anyway, so the rule holds in both places.
 *
 * A student taken off the class after attempting (#242) gets a row of their own in `removed`, by
 * the same rules, and is left out of the class's counts, items and steps.
 */
import {
  buildSessionReport,
  type ItemRow,
  type ReportItemInput,
  type ReportResponseInput,
  type Score,
  type StepRow,
} from "@/lib/live/report";

/** A current member of the class, or (#242) a student taken off it after attempting. */
export type Membership = "member" | "removed";

export interface ReportStudentInput {
  id: string;
  displayName: string;
  /** Absent means a member. */
  membership?: Membership;
}

export interface ReportMarkInput {
  itemId: string;
  points: number;
  maxPoints: number;
}

export interface ReportAttemptInput {
  studentId: string;
  id: string;
  number: number;
  submittedAt: string | null;
  /** Null while the attempt is open, and for every attempt before the close. */
  score: number | null;
  maxScore: number | null;
  /** The attempt's per-item marks; null while open or before the close. */
  marks: readonly ReportMarkInput[] | null;
}

export interface AssignmentReportInput {
  /** Whether scores may be shown: the assignment has closed. */
  released: boolean;
  items: readonly ReportItemInput[];
  students: readonly ReportStudentInput[];
  attempts: readonly ReportAttemptInput[];
}

export type StudentStatus = "not_started" | "in_progress" | "submitted";

export const STUDENT_STATUS_LABEL: Readonly<Record<StudentStatus, string>> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
};

export interface BestAttempt {
  attemptNumber: number;
  score: number;
  maxScore: number;
  /** 0-100, or null when the attempt was worth nothing. */
  percent: number | null;
}

export interface AssignmentStudentRow {
  studentId: string;
  displayName: string;
  membership: Membership;
  status: StudentStatus;
  attemptsUsed: number;
  /** Null before the close, and for a student with nothing submitted. */
  best: BestAttempt | null;
  /** The best attempt's mark on each item, in item order; null where it has none. */
  scores: (Score | null)[];
}

export interface AssignmentItemRow extends ItemRow {
  /** 0-100: the share of answers that earned everything on offer; null when nobody answered. */
  percentCorrect: number | null;
}

export interface AssignmentReport {
  released: boolean;
  items: AssignmentItemRow[];
  /** The class as it stands: its current members. Counts, items and steps are theirs alone. */
  students: AssignmentStudentRow[];
  /** Students taken off the class after attempting (#242), by name; their work is kept. */
  removed: AssignmentStudentRow[];
  steps: StepRow[];
  counts: { notStarted: number; inProgress: number; submitted: number };
}

type ScoredAttempt = ReportAttemptInput & { score: number; maxScore: number };

const isScored = (attempt: ReportAttemptInput): attempt is ScoredAttempt =>
  attempt.submittedAt !== null && attempt.score !== null && attempt.maxScore !== null;

/** The highest total among the submitted attempts; a tie goes to the earlier attempt. */
export function pickBestAttempt(attempts: readonly ReportAttemptInput[]): ScoredAttempt | null {
  return attempts
    .filter(isScored)
    .reduce<ScoredAttempt | null>(
      (best, next) =>
        best === null ||
        next.score > best.score ||
        (next.score === best.score && next.number < best.number)
          ? next
          : best,
      null,
    );
}

function statusOf(attempts: readonly ReportAttemptInput[]): StudentStatus {
  if (attempts.some((attempt) => attempt.submittedAt === null)) return "in_progress";
  return attempts.length > 0 ? "submitted" : "not_started";
}

function bestOf(attempt: ScoredAttempt | null): BestAttempt | null {
  if (attempt === null) return null;
  return {
    attemptNumber: attempt.number,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percent: attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : null,
  };
}

function groupByStudent(
  input: AssignmentReportInput,
): ReadonlyMap<string, readonly ReportAttemptInput[]> {
  const grouped = new Map<string, ReportAttemptInput[]>(
    input.students.map((student) => [student.id, []]),
  );
  for (const attempt of input.attempts) grouped.get(attempt.studentId)?.push(attempt);
  return grouped;
}

/** The best attempts' marks as the session report's responses, one position per item. */
function bestResponses(
  items: readonly ReportItemInput[],
  best: ReadonlyMap<string, ScoredAttempt | null>,
): ReportResponseInput[] {
  const positionOf = new Map(items.map((item) => [item.itemId, item.position]));
  return [...best].flatMap(([studentId, attempt]) =>
    (attempt?.marks ?? []).flatMap((mark) => {
      const position = positionOf.get(mark.itemId);
      return position === undefined
        ? []
        : [
            {
              participantId: studentId,
              itemPosition: position,
              points: mark.points,
              maxPoints: mark.maxPoints,
            },
          ];
    }),
  );
}

const withPercentCorrect = (item: ItemRow): AssignmentItemRow => ({
  ...item,
  percentCorrect: item.responded > 0 ? (item.full / item.responded) * 100 : null,
});

/** The session report over one group of students, each with only their own best attempt. */
function sessionOver(
  items: readonly ReportItemInput[],
  group: readonly ReportStudentInput[],
  best: ReadonlyMap<string, ScoredAttempt | null>,
) {
  const ids = new Set(group.map((s) => s.id));
  return buildSessionReport({
    items,
    // The roster has no join time; the id keeps the order stable for two students of one name.
    participants: group.map((s) => ({ id: s.id, displayName: s.displayName, joinedAt: "" })),
    responses: bestResponses(items, new Map([...best].filter(([id]) => ids.has(id)))),
  });
}

function studentRows(
  session: ReturnType<typeof buildSessionReport>,
  membership: Membership,
  attemptsOf: ReadonlyMap<string, readonly ReportAttemptInput[]>,
  best: ReadonlyMap<string, ScoredAttempt | null>,
): AssignmentStudentRow[] {
  return session.students.map((row): AssignmentStudentRow => {
    const attempts = attemptsOf.get(row.participantId) ?? [];
    return {
      studentId: row.participantId,
      displayName: row.displayName,
      membership,
      status: statusOf(attempts),
      attemptsUsed: attempts.length,
      best: bestOf(best.get(row.participantId) ?? null),
      scores: row.scores,
    };
  });
}

export function buildAssignmentReport(input: AssignmentReportInput): AssignmentReport {
  const attemptsOf = groupByStudent(input);
  const best = new Map(
    [...attemptsOf].map(([id, attempts]) => [
      id,
      input.released ? pickBestAttempt(attempts) : null,
    ]),
  );
  const isRemoved = (s: ReportStudentInput) => s.membership === "removed";
  // The class's own figures are the class as it stands; a removed student is shown on their own.
  const session = sessionOver(
    input.items,
    input.students.filter((s) => !isRemoved(s)),
    best,
  );
  const removedSession = sessionOver(input.items, input.students.filter(isRemoved), best);
  const students = studentRows(session, "member", attemptsOf, best);

  return {
    released: input.released,
    items: session.items.map(withPercentCorrect),
    students,
    removed: studentRows(removedSession, "removed", attemptsOf, best),
    steps: session.steps,
    counts: {
      notStarted: students.filter((s) => s.status === "not_started").length,
      inProgress: students.filter((s) => s.status === "in_progress").length,
      submitted: students.filter((s) => s.status === "submitted").length,
    },
  };
}
