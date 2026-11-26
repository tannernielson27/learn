import type { SupabaseClient } from "@supabase/supabase-js";
import { REVIEW_GAPS_DAYS, type ReviewGap, type ReviewState } from "@/lib/ngn/reviewSchedule";
import type { Database } from "./database.types";

/**
 * A student's review list (#627, 20261126000400_review_entries.sql). The list itself is never read
 * or written as a table: the student reads their own count through `my_review_due`, and the
 * server, as the service role, fills it from released assignments, reads the due questions and
 * starts a review run, each for the student it verified. Answers in practice move the list in the
 * database, in the same statement that records them (`record_practice_response`).
 */

type Client = SupabaseClient<Database>;

/** A stored row's state columns, as `review_entries` and `review_due_items` hold them. */
export interface ReviewStateRow {
  gap_days: number | null;
  due_at: string | null;
  retired_at: string | null;
}

function epochOf(text: string, field: string): number {
  const at = Date.parse(text);
  if (!Number.isFinite(at)) throw new RangeError(`${field} must be a time, got ${text}`);
  return at;
}

const isGap = (value: number): value is ReviewGap =>
  (REVIEW_GAPS_DAYS as readonly number[]).includes(value);

/**
 * A row as ADR 0019's state: waiting is the gap and the due time, retired is the time it retired.
 * Any other shape throws a `RangeError`, as `reviewSchedule.ts` does for a malformed state. The
 * table's check constraint makes such a row impossible to store.
 */
export function reviewStateFromRow(row: ReviewStateRow): ReviewState {
  const { gap_days: gap, due_at: due, retired_at: retired } = row;
  if (retired !== null && gap === null && due === null) {
    return { kind: "retired", retiredAt: epochOf(retired, "retired_at") };
  }
  if (retired === null && gap !== null && due !== null) {
    if (!isGap(gap)) {
      throw new RangeError(`gap_days must be one of ${REVIEW_GAPS_DAYS.join(", ")}, got ${gap}`);
    }
    return { kind: "waiting", gapDays: gap, dueAt: epochOf(due, "due_at") };
  }
  throw new RangeError("a review row is either waiting (gap and due) or retired, never both");
}

/** The inverse of `reviewStateFromRow`: one stored row per state, nothing derived twice. */
export function reviewStateToRow(state: ReviewState): ReviewStateRow {
  return state.kind === "retired"
    ? { gap_days: null, due_at: null, retired_at: new Date(state.retiredAt).toISOString() }
    : { gap_days: state.gapDays, due_at: new Date(state.dueAt).toISOString(), retired_at: null };
}

/** The student's own count: how many are due now, and when the next one falls due. */
export interface ReviewDue {
  due: number;
  /** ISO time of the next question not yet due; null when none is waiting. */
  nextDueAt: string | null;
}

/** As the student, under their own session. Null when the read failed. */
export async function readMyReviewDue(user: Client): Promise<ReviewDue | null> {
  const { data, error } = await user.rpc("my_review_due");
  if (error || !Array.isArray(data)) return null;
  const row = data[0];
  const due = Number(row?.due ?? 0);
  if (!Number.isInteger(due) || due < 0) return null;
  const next = row?.next_due_at;
  return { due, nextDueAt: typeof next === "string" ? next : null };
}

/**
 * Adds the questions missed in the student's released assignments that are not on their list yet.
 * Service role, for the verified student. How many were added, or null when the call failed.
 */
export async function fillReviewFromAssignments(
  service: Client,
  student: string,
): Promise<number | null> {
  const { data, error } = await service.rpc("fill_review_from_assignments", { student });
  if (error || typeof data !== "number") return null;
  return data;
}

/** A due question as the server picks a sitting from it: ids and the state, no content. */
export interface DueReviewItem {
  questionId: string;
  workspaceId: string;
  state: ReviewState;
}

/** The student's due questions, the earliest first. Service role. Null when the read failed. */
export async function readDueReviewItems(
  service: Client,
  student: string,
): Promise<DueReviewItem[] | null> {
  const { data, error } = await service.rpc("review_due_items", { student });
  if (error || !Array.isArray(data)) return null;
  return data.map((row) => ({
    questionId: row.item_id,
    workspaceId: row.org_id,
    state: reviewStateFromRow({ gap_days: row.gap_days, due_at: row.due_at, retired_at: null }),
  }));
}

export type ReviewStartRefusal = "invalid" | "empty" | "failed";

export type ReviewStart = { ok: true; runId: string } | { ok: false; reason: ReviewStartRefusal };

/**
 * Starts a review run of the named questions. The database refuses the whole request ('invalid')
 * unless every one is a due, served row of this student's, all of one workspace, ten at most.
 */
export async function startReviewRun(
  service: Client,
  student: string,
  itemIds: readonly string[],
): Promise<ReviewStart> {
  const { data, error } = await service.rpc("start_review_run", {
    student,
    target_items: [...itemIds],
  });
  if (error || !Array.isArray(data)) return { ok: false, reason: "failed" };
  const row = data[0] as { outcome?: unknown; run_id?: unknown } | undefined;
  if (row?.outcome === "started" && typeof row.run_id === "string") {
    return { ok: true, runId: row.run_id };
  }
  if (row?.outcome === "invalid" || row?.outcome === "empty") {
    return { ok: false, reason: row.outcome };
  }
  return { ok: false, reason: "failed" };
}
