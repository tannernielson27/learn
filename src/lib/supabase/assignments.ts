import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentInput,
  AssignmentSource,
  AssignmentWindowInput,
} from "@/lib/assignments/assignments";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * Assignments (#207), as the signed-in user: row level security keeps an author to their own org
 * and a student to the open assignments of their own classes. The item set and the patient record
 * are written by the database on insert and are never selected here.
 */

/** A cap so no list is unbounded. */
export const ASSIGNMENT_LIST_LIMIT = 200;

const SUMMARY_COLUMNS = "id, class_id, title, opens_at, closes_at, max_attempts, shuffle_options";

export interface AssignmentSummary {
  id: string;
  classId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  maxAttempts: number;
  shuffleOptions: boolean;
}

/**
 * Why a write was refused. `unavailable` is the database's 22023: nothing published to assign, or
 * an edit the assignment's state no longer allows. `gone` is a source or class the author cannot
 * see. `invalid` is a check constraint, `rate_limited` the authoring limit (54000).
 */
export type AssignmentWriteFailure = "unavailable" | "gone" | "invalid" | "rate_limited" | "failed";

export type AssignmentWrite = { ok: true } | { ok: false; reason: AssignmentWriteFailure };

function failureOf(code: string | undefined): AssignmentWriteFailure {
  switch (code) {
    case "22023":
      return "unavailable";
    case "P0002":
    case "23503":
      return "gone";
    case "23514":
      return "invalid";
    case "54000":
      return "rate_limited";
    default:
      return "failed";
  }
}

interface SummaryRow {
  id: string;
  class_id: string;
  title: string;
  opens_at: string;
  closes_at: string;
  max_attempts: number;
  shuffle_options: boolean;
}

function toSummary(row: SummaryRow): AssignmentSummary {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    maxAttempts: row.max_attempts,
    shuffleOptions: row.shuffle_options,
  };
}

/** The title is left blank so the database names the assignment after its source. */
export async function createAssignment(
  client: Client,
  source: AssignmentSource,
  input: AssignmentInput,
): Promise<AssignmentWrite> {
  const { error } = await client.from("assignments").insert({
    class_id: input.classId,
    bank_id: source.kind === "bank" ? source.id : null,
    case_study_id: source.kind === "case_study" ? source.id : null,
    title: "",
    opens_at: input.opensAt,
    closes_at: input.closesAt,
    max_attempts: input.maxAttempts,
    shuffle_options: input.shuffleOptions,
  });
  return error ? { ok: false, reason: failureOf(error.code) } : { ok: true };
}

/** One class's assignments for its author, soonest to open first. Null on an error. */
export async function listClassAssignments(
  client: Client,
  classId: string,
): Promise<AssignmentSummary[] | null> {
  const { data, error } = await client
    .from("assignments")
    .select(SUMMARY_COLUMNS)
    .eq("class_id", classId)
    .order("opens_at")
    .order("id")
    .limit(ASSIGNMENT_LIST_LIMIT);
  if (error || !data) return null;
  return data.map(toSummary);
}

/**
 * A student's assignments that are open now: RLS already leaves out every class they are not in
 * and every assignment that has not opened, and this leaves out the ones that have closed.
 */
export async function listOpenAssignments(
  client: Client,
  now: Date,
): Promise<AssignmentSummary[] | null> {
  const { data, error } = await client
    .from("assignments")
    .select(SUMMARY_COLUMNS)
    .gt("closes_at", now.toISOString())
    .order("closes_at")
    .order("id")
    .limit(ASSIGNMENT_LIST_LIMIT);
  if (error || !data) return null;
  return data.map(toSummary);
}

async function updateAssignment(
  client: Client,
  assignmentId: string,
  patch: Partial<AssignmentWindowInput>,
): Promise<AssignmentWrite> {
  const { data, error } = await client
    .from("assignments")
    .update({
      opens_at: patch.opensAt,
      closes_at: patch.closesAt,
      max_attempts: patch.maxAttempts,
      shuffle_options: patch.shuffleOptions,
    })
    .eq("id", assignmentId)
    .select("id");
  if (error) return { ok: false, reason: failureOf(error.code) };
  return (data?.length ?? 0) > 0 ? { ok: true } : { ok: false, reason: "gone" };
}

/** Before it opens: the window, the attempts and shuffling. */
export function updateAssignmentWindow(
  client: Client,
  assignmentId: string,
  input: AssignmentWindowInput,
): Promise<AssignmentWrite> {
  return updateAssignment(client, assignmentId, input);
}

/** After it opens: the close time only. */
export function updateAssignmentCloseTime(
  client: Client,
  assignmentId: string,
  closesAt: string,
): Promise<AssignmentWrite> {
  return updateAssignment(client, assignmentId, { closesAt });
}

/** Deletes one that has not opened. False when nothing was deleted (it has opened, or is gone). */
export async function deleteAssignment(client: Client, assignmentId: string): Promise<boolean> {
  const { data, error } = await client
    .from("assignments")
    .delete()
    .eq("id", assignmentId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
