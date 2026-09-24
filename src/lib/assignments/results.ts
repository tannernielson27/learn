/**
 * A student's results page for one assignment (#210), decided on the server.
 *
 * Everything the results page hands the browser is in the view this returns, so this is where the
 * rule is kept: keys, rationales and scores only once the assignment has closed, and only the
 * student's own. The order is the rule:
 *
 *   1. The submit at close for this student and this assignment (#208's `autoSubmitExpired`), so
 *      an attempt left open is marked with what it saved before anything is read.
 *   2. The result, through `public.my_assignment_result` as the student. It answers only after the
 *      close by the database's clock (with the two seconds of grace), and only with the caller's
 *      own attempts. No rows means "not released to you", whatever the app's clock says.
 *   3. Only then the items with their keys and rationales, as the service role.
 *
 * The best attempt counts (owner decision 2026-09-23): `pickBestAttempt`, shared with #211's report.
 *
 * Server only: it reaches `parseSubmission`, the scoring seam.
 */
import { ehrRecordSchema, type AnyResponse, type EhrRecord, type Item } from "@/lib/ngn/schemas";
import { parseSubmission } from "@/lib/ngn/submit";
import type { ScoreResult, ScoringModel } from "@/lib/ngn/types";
import type { ExpiredFilter, StudentAssignment } from "@/lib/supabase/attempts";
import type { MyResultRead, ResultAttempt, ResultMark } from "@/lib/supabase/results";
import type { SetItem } from "./attemptScoring";
import { pickBestAttempt } from "./report";

export interface ResultsStore {
  /** The submit at close, narrowed to this assignment and this student. */
  autoSubmit(filter: ExpiredFilter): Promise<number>;
  /** The student's own result, as the student. */
  result(assignmentId: string): Promise<MyResultRead>;
  /** The assignment under row level security, to tell "not yet" from "not yours". */
  assignment(assignmentId: string): Promise<StudentAssignment | null>;
  /** The items with their keys, as the service role. Only read once the result is released. */
  items(ids: readonly string[]): Promise<SetItem[] | null>;
}

export interface ResultsHeader {
  id: string;
  title: string;
  closesAt: string;
  /**
   * Whose zone the close is said in (#242). Null for a student taken off the class after
   * attempting, who still sees their own results but can no longer read the assignment row.
   */
  classId: string | null;
}

/** How the student's best attempt stands on one item. */
export type ResultOutcome =
  | { kind: "answered"; response: AnyResponse; score: ScoreResult }
  /** The best attempt left it blank. */
  | { kind: "not_answered" }
  /** No attempt at all. */
  | { kind: "not_attempted" }
  /** Attempts, but none submitted yet: the submit at close has not reached it. */
  | { kind: "unmarked" }
  /** An answer is stored but cannot be drawn (it no longer parses, or its mark is incomplete). */
  | { kind: "unreadable" };

export interface ResultEntry {
  rowId: string;
  /** The whole item, key and rationale included: this is after the close. */
  item: Item;
  outcome: ResultOutcome;
}

export interface BestResult {
  attemptNumber: number;
  score: number;
  maxScore: number;
}

export type ResultsView =
  | { kind: "missing" }
  | { kind: "failed" }
  | { kind: "pending"; assignment: ResultsHeader }
  | {
      kind: "results";
      assignment: ResultsHeader;
      best: BestResult | null;
      attemptsMade: number;
      entries: ResultEntry[];
      /** The case study's patient record, parsed; null for a bank. */
      record: EhrRecord | null;
    };

const SCORING_MODELS: ReadonlySet<string> = new Set<ScoringModel>([
  "zero_one",
  "plus_minus",
  "rationale",
]);

function recordOf(value: unknown): EhrRecord | null {
  if (value === null || value === undefined) return null;
  const parsed = ehrRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A stored mark as the score the renderers draw, or null when it is not whole. */
function scoreOf(mark: ResultMark): ScoreResult | null {
  if (mark.points === null || mark.maxPoints === null) return null;
  if (mark.model === null || !SCORING_MODELS.has(mark.model)) return null;
  if (!Array.isArray(mark.breakdown)) return null;
  return {
    points: mark.points,
    maxPoints: mark.maxPoints,
    model: mark.model as ScoringModel,
    breakdown: mark.breakdown as ScoreResult["breakdown"],
    ...(Array.isArray(mark.groups) ? { groups: mark.groups as ScoreResult["groups"] } : {}),
  };
}

function answeredOutcome(item: Item, mark: ResultMark): ResultOutcome {
  const parsed = parseSubmission({ response: mark.response }, item.type);
  const score = scoreOf(mark);
  if (!parsed.ok || score === null) return { kind: "unreadable" };
  return { kind: "answered", response: parsed.response, score };
}

function outcomeFor(
  entry: SetItem,
  attempts: readonly ResultAttempt[],
  best: ResultAttempt | null,
): ResultOutcome {
  if (attempts.length === 0) return { kind: "not_attempted" };
  if (best === null) return { kind: "unmarked" };
  const mark = best.marks?.find((candidate) => candidate.itemId === entry.rowId);
  return mark ? answeredOutcome(entry.item, mark) : { kind: "not_answered" };
}

function bestOf(attempts: readonly ResultAttempt[]): ResultAttempt | null {
  const picked = pickBestAttempt(
    attempts.map((attempt) => ({
      studentId: "",
      id: attempt.id,
      number: attempt.number,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      marks: null,
    })),
  );
  return picked ? (attempts.find((attempt) => attempt.id === picked.id) ?? null) : null;
}

async function submitAtClose(store: ResultsStore, filter: ExpiredFilter): Promise<void> {
  try {
    await store.autoSubmit(filter);
  } catch (error) {
    // The page still loads: an attempt not yet submitted shows as not marked, never as a score.
    console.error("[assignment-results] the submit at close failed", {
      assignmentId: filter.assignmentId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function loadResultsPage(
  store: ResultsStore,
  assignmentId: string,
  studentId: string,
): Promise<ResultsView> {
  await submitAtClose(store, { assignmentId, studentId });

  const read = await store.result(assignmentId);
  if (read.kind === "failed") return { kind: "failed" };
  if (read.kind === "withheld") {
    const assignment = await store.assignment(assignmentId);
    return assignment
      ? {
          kind: "pending",
          assignment: {
            id: assignment.id,
            title: assignment.title,
            closesAt: assignment.closesAt,
            classId: assignment.classId,
          },
        }
      : { kind: "missing" };
  }

  const { result } = read;
  // The assignment row only names the class; a removed student reads none, and still has results.
  const [set, assignment] = await Promise.all([
    store.items(result.itemSet),
    store.assignment(assignmentId).catch(() => null),
  ]);
  if (set === null) return { kind: "failed" };

  const best = bestOf(result.attempts);
  return {
    kind: "results",
    assignment: {
      id: result.assignmentId,
      title: result.title,
      closesAt: result.closesAt,
      classId: assignment?.classId ?? null,
    },
    best:
      best && best.score !== null && best.maxScore !== null
        ? { attemptNumber: best.number, score: best.score, maxScore: best.maxScore }
        : null,
    attemptsMade: result.attempts.length,
    entries: set.map((entry) => ({
      rowId: entry.rowId,
      item: entry.item,
      outcome: outcomeFor(entry, result.attempts, best),
    })),
    record: recordOf(result.patientRecord),
  };
}
