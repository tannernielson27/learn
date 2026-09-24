import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptProgress } from "@/lib/assignments/assignments";
import type { AttemptScore, SetItem } from "@/lib/assignments/attemptScoring";
import { asAttemptRefusal, type AttemptRefusal } from "@/lib/assignments/attemptRefusals";
import { isUuid } from "@/lib/authoring/ids";
import type { Item } from "@/lib/ngn/schemas";
import type { Database, Json } from "./database.types";
import { fromItemRow } from "./itemRows";

/**
 * Taking an assignment (#208), against the database.
 *
 * Two clients, never confused. The student's own (`user`) reads their assignment, their attempts
 * and their saved answers under row level security and column grants that leave every score out,
 * and calls the three functions that take their identity from the JWT. The service role
 * (`service`) reads the items with their keys — for building the keyless payload and for scoring,
 * both on the server — and records scores, which no student role may do.
 */

type Client = SupabaseClient<Database>;

/** An assignment as its student reads it: the window, the attempts, the set and the record. */
export interface StudentAssignment {
  id: string;
  classId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  maxAttempts: number;
  shuffleOptions: boolean;
  /** Row ids of the items, in the set's order. */
  itemSet: string[];
  /** The case study's patient record snapshot, unparsed; null for a bank. */
  patientRecord: Json | null;
}

/** One of this student's attempts, without its score: the column grant has none to give. */
export interface AttemptSummary {
  id: string;
  number: number;
  startedAt: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

export type AttemptCall<T> = { ok: true; value: T } | { ok: false; refusal: AttemptRefusal };

/** What a submit is to score: the set, the answers as saved, and the revision they were read at. */
export interface SubmissionInput {
  itemSet: string[];
  revision: number;
  answers: Record<string, unknown>;
}

/** An open attempt whose window has closed, with what it saved. */
export interface ExpiredAttempt extends SubmissionInput {
  attemptId: string;
  studentId: string;
  assignmentId: string;
}

const ASSIGNMENT_COLUMNS =
  "id, class_id, title, opens_at, closes_at, max_attempts, shuffle_options, item_set, patient_record";
const ATTEMPT_COLUMNS = "id, number, started_at, submitted_at, auto_submitted";
const ITEM_COLUMNS = "id, type, cjmm_step, tags, version, content, answer_key, rationale, scoring";

/** A set of item ids as stored, checked: anything that is not a list of uuids reads as empty. */
function toItemSet(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && isUuid(entry));
}

function toAnswers(value: Json | null | undefined): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/** A function's error as a refusal: a missing sign-in is the student's to fix, the rest is ours. */
function refusalOf(error: { code?: string } | null): AttemptRefusal {
  return error?.code === "42501" ? "signed_out" : "failed";
}

/** The assignment, if this student may see it now (RLS: a current member, once it has opened). */
export async function readStudentAssignment(
  client: Client,
  assignmentId: string,
): Promise<StudentAssignment | null> {
  const { data, error } = await client
    .from("assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("id", assignmentId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    classId: data.class_id,
    title: data.title,
    opensAt: data.opens_at,
    closesAt: data.closes_at,
    maxAttempts: data.max_attempts,
    shuffleOptions: data.shuffle_options,
    itemSet: toItemSet(data.item_set),
    patientRecord: data.patient_record,
  };
}

/** This student's attempts at one assignment, oldest first. Null on an error. */
export async function listMyAttempts(
  client: Client,
  assignmentId: string,
): Promise<AttemptSummary[] | null> {
  const { data, error } = await client
    .from("assignment_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("assignment_id", assignmentId)
    .order("number");
  if (error || !data) return null;
  return data.map((row) => ({
    id: row.id,
    number: row.number,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    autoSubmitted: row.auto_submitted,
  }));
}

/**
 * How this student's attempts stand at each of some assignments, for the student home: how many
 * were submitted and whether one is open. Assignments with no attempt are absent. Null on an error.
 */
export async function listMyAttemptProgress(
  client: Client,
  assignmentIds: readonly string[],
): Promise<Map<string, AttemptProgress> | null> {
  if (assignmentIds.length === 0) return new Map();
  const { data, error } = await client
    .from("assignment_attempts")
    .select("assignment_id, submitted_at")
    .in("assignment_id", [...assignmentIds]);
  if (error || !data) return null;
  return data.reduce((progress, row) => {
    const held = progress.get(row.assignment_id) ?? { submitted: 0, open: false };
    return new Map(progress).set(
      row.assignment_id,
      row.submitted_at === null
        ? { ...held, open: true }
        : { ...held, submitted: held.submitted + 1 },
    );
  }, new Map<string, AttemptProgress>());
}

/** What one of this student's attempts saved, keyed by item row id. Null on an error. */
export async function readSavedAnswers(
  client: Client,
  attemptId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client
    .from("attempt_responses")
    .select("item_id, response")
    .eq("attempt_id", attemptId);
  if (error || !data) return null;
  return Object.fromEntries(data.map((row) => [row.item_id, row.response]));
}

/**
 * The set's items with their keys, in the set's order, as the service role reads them. For the
 * server only: what leaves it is built from these by `buildAttemptSet`, keyless.
 *
 * Stored JSON is external input, so every item is validated whole. An item that has been deleted
 * since the assignment was made, or that no longer validates, is left out — of the page and of the
 * score alike, since both read the set through here. Null on a database error.
 */
export async function readSetItems(
  service: Client,
  ids: readonly string[],
): Promise<SetItem[] | null> {
  if (ids.length === 0) return [];
  const { data, error } = await service
    .from("items")
    .select(ITEM_COLUMNS)
    .in("id", [...ids]);
  if (error || !data) return null;
  const byId = new Map<string, Item>();
  for (const row of data) {
    const stored = fromItemRow(row);
    if (stored.ok) byId.set(row.id, stored.value);
  }
  return ids.flatMap((rowId) => {
    const item = byId.get(rowId);
    return item ? [{ rowId, item }] : [];
  });
}

/** Starts an attempt, or hands back the one already open. */
export async function startAttempt(
  client: Client,
  assignmentId: string,
): Promise<AttemptCall<string>> {
  const { data, error } = await client.rpc("start_assignment_attempt", {
    target_assignment: assignmentId,
  });
  if (error) return { ok: false, refusal: refusalOf(error) };
  const row = data?.[0];
  const refusal = asAttemptRefusal(row?.refusal);
  if (refusal !== null) return { ok: false, refusal };
  if (!row?.attempt_id) return { ok: false, refusal: "failed" };
  return { ok: true, value: row.attempt_id };
}

/** Saves one answer, last write wins. The value is when the database took it. */
export async function saveAnswer(
  client: Client,
  attemptId: string,
  itemId: string,
  response: Json,
): Promise<AttemptCall<string>> {
  const { data, error } = await client.rpc("save_attempt_response", {
    target_attempt: attemptId,
    target_item: itemId,
    answer: response,
  });
  if (error) return { ok: false, refusal: refusalOf(error) };
  const row = data?.[0];
  const refusal = asAttemptRefusal(row?.refusal);
  if (refusal !== null) return { ok: false, refusal };
  if (!row?.saved_at) return { ok: false, refusal: "failed" };
  return { ok: true, value: row.saved_at };
}

/** What a submit the student asked for is to score. */
export async function beginSubmission(
  client: Client,
  attemptId: string,
): Promise<AttemptCall<SubmissionInput>> {
  const { data, error } = await client.rpc("begin_attempt_submission", {
    target_attempt: attemptId,
  });
  if (error) return { ok: false, refusal: refusalOf(error) };
  const row = data?.[0];
  const refusal = asAttemptRefusal(row?.refusal);
  if (refusal !== null) return { ok: false, refusal };
  if (!row || typeof row.revision !== "number") return { ok: false, refusal: "failed" };
  return {
    ok: true,
    value: {
      itemSet: toItemSet(row.item_set),
      revision: row.revision,
      answers: toAnswers(row.answers),
    },
  };
}

export interface RecordInput {
  attemptId: string;
  studentId: string;
  revision: number;
  score: AttemptScore;
  automatic: boolean;
}

/**
 * Writes the score, once, as the service role. `already_submitted` is a refusal here and the
 * caller decides what it means: for a submit at close it is simply "someone else got there first".
 */
export async function recordSubmission(
  service: Client,
  input: RecordInput,
): Promise<AttemptCall<string>> {
  const { data, error } = await service.rpc("record_attempt_submission", {
    target_attempt: input.attemptId,
    student: input.studentId,
    expected_revision: input.revision,
    total: input.score.total,
    possible: input.score.possible,
    marks: input.score.marks as unknown as Json,
    automatic: input.automatic,
  });
  if (error) return { ok: false, refusal: "failed" };
  const row = data?.[0];
  const refusal = asAttemptRefusal(row?.refusal);
  if (refusal !== null) return { ok: false, refusal };
  if (!row?.submitted_at) return { ok: false, refusal: "failed" };
  return { ok: true, value: row.submitted_at };
}

export interface ExpiredFilter {
  assignmentId?: string;
  studentId?: string;
  limit?: number;
}

/** Open attempts whose window has closed, as the service role sees them. Null on an error. */
export async function listExpiredAttempts(
  service: Client,
  filter: ExpiredFilter,
): Promise<ExpiredAttempt[] | null> {
  const { data, error } = await service.rpc("expired_open_attempts", {
    ...(filter.assignmentId ? { target_assignment: filter.assignmentId } : {}),
    ...(filter.studentId ? { target_student: filter.studentId } : {}),
    ...(filter.limit ? { max_rows: filter.limit } : {}),
  });
  if (error || !data) return null;
  return data.map((row) => ({
    attemptId: row.attempt_id,
    studentId: row.student_id,
    assignmentId: row.assignment_id,
    itemSet: toItemSet(row.item_set),
    revision: row.revision,
    answers: toAnswers(row.answers),
  }));
}
