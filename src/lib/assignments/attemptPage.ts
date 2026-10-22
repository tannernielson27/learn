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
import { parseCaseStudyRuns, runAt, type CaseStudyRun } from "@/lib/live/caseStudyRuns";
import { reachedStep, recordAtStep, type EhrRecordView } from "@/lib/ngn/chartReveal";
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
  /**
   * The whole patient record as stored (#335), null for a bank; and for a whole quiz, the case
   * studies it plays in place with theirs (#470, `case_study_records`). Service role; never sent.
   */
  record(
    assignmentId: string,
  ): Promise<{ ok: true; record: unknown; runs?: unknown } | { ok: false }>;
  autoSubmit(filter: ExpiredFilter): Promise<number>;
}

/** The facts about the assignment every view shows. */
export interface AssignmentHeader {
  id: string;
  /** Whose zone the close is said in (#242). */
  classId: string;
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
      /**
       * The items, keyless. For a case study (#335), only the steps reached: up to and including
       * the first without a saved answer. A later step arrives when the page is read again. For a
       * whole quiz that plays case studies in place (#470), the set up to that same point in the
       * first case study not yet finished: what follows it arrives with its next step.
       */
      items: AttemptItemPayload[];
      /** How many items the set has, reached or not. */
      total: number;
      /**
       * The patient record at each item in `items`, one for one: a case study's record at that
       * step (`recordAtStep`), or null for a loose question of a whole quiz. Null for a bank with
       * no case study in it. Never a whole record: nothing a later step reveals is in it.
       */
      records: (EhrRecordView | null)[] | null;
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
    classId: assignment.classId,
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

/**
 * What of the set a student is sent (#335). A bank: every item, as always. A case study: the steps
 * up to and including the first with no saved answer, and the record's view at each, so nothing a
 * later step reveals reaches the page before the steps before it have been answered. Going back
 * to an earlier step shows that step's own chart, which is why every reached step's is sent.
 *
 * A whole quiz that plays case studies in place (#470) keeps the same rule for each of them, as a
 * case study assigned on its own does: the set is sent up to and including the first step not yet
 * reached by an answer to the step before it, with each step's chart and none for a loose
 * question. What comes after that step (the rest of the case study, and anything after it in the
 * quiz) arrives when it has been answered. A case study assigned on its own is one such case
 * study, at the start of the set, so both are worked out here the same way.
 */
function reachedOf(
  items: AttemptItemPayload[],
  record: EhrRecord | null,
  stored: CaseStudyRun[],
): { items: AttemptItemPayload[]; total: number; records: (EhrRecordView | null)[] | null } {
  const runs: CaseStudyRun[] =
    stored.length > 0
      ? stored
      : record === null
        ? []
        : [{ caseStudyId: "", title: "", firstPosition: 1, stepCount: items.length, record }];
  if (runs.length === 0 || items.length === 0) return { items, total: items.length, records: null };

  let cut = items.length;
  for (const run of runs) {
    const steps = items.slice(run.firstPosition - 1, run.firstPosition - 1 + run.stepCount);
    const reached = Math.min(reachedStep(steps.map((item) => item.saved !== null)), steps.length);
    if (reached < steps.length) {
      cut = Math.min(cut, run.firstPosition - 1 + reached);
      break;
    }
  }
  const sent = items.slice(0, cut);
  return {
    items: sent,
    total: items.length,
    records: sent.map((_, index) => {
      const place = runAt(runs, index + 1);
      return place === null || place.run.record === null
        ? null
        : recordAtStep(place.run.record, place.step);
    }),
  };
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
    const [set, answers, stored] = await Promise.all([
      store.items(assignment.itemSet),
      store.answers(open.id),
      store.record(assignment.id),
    ]);
    if (set === null || answers === null || !stored.ok) return { kind: "failed" };
    const items = buildAttemptSet({
      set,
      attemptId: open.id,
      shuffle: assignment.shuffleOptions,
      answers,
    });
    return {
      kind: "taking",
      assignment: headerOf(assignment),
      attempt: { id: open.id, number: open.number },
      ...reachedOf(items, recordOf(stored.record), parseCaseStudyRuns(stored.runs)),
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
