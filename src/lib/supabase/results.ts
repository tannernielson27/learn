import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/authoring/ids";
import type { Database, Json } from "./database.types";

/**
 * A student's own results (#210), through `public.my_assignment_result`, as the student.
 *
 * The function answers only the caller, only about their own attempts, and only once the
 * assignment has closed by the database's clock. So "no rows" means "not released to you" — not
 * closed yet, or not yours — and the caller must not read a key before this says `released`.
 */

type Client = SupabaseClient<Database>;

/** One saved answer of a submitted attempt and its mark as #208 recorded it. */
export interface ResultMark {
  itemId: string;
  response: unknown;
  points: number | null;
  maxPoints: number | null;
  model: string | null;
  breakdown: unknown;
  groups: unknown;
}

export interface ResultAttempt {
  id: string;
  number: number;
  submittedAt: string | null;
  autoSubmitted: boolean;
  /** Null for an attempt still open. */
  score: number | null;
  maxScore: number | null;
  marks: ResultMark[] | null;
}

export interface MyResult {
  assignmentId: string;
  title: string;
  closesAt: string;
  maxAttempts: number;
  /** Row ids of the items, in the set's order. */
  itemSet: string[];
  /** The case study's patient record snapshot, unparsed; null for a bank. */
  patientRecord: Json | null;
  /** Oldest first; empty when the student made none. */
  attempts: ResultAttempt[];
}

export type MyResultRead =
  { kind: "failed" } | { kind: "withheld" } | { kind: "released"; result: MyResult };

type Row = Database["public"]["Functions"]["my_assignment_result"]["Returns"][number];

/** numeric over PostgREST is a number, but a driver may hand back a string. */
const toNumber = (value: unknown): number | null =>
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);

function toItemSet(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && isUuid(entry));
}

function toMarks(value: Json | null | undefined): ResultMark[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const itemId = entry.item_id;
    if (typeof itemId !== "string" || !isUuid(itemId)) return [];
    return [
      {
        itemId,
        response: entry.response ?? null,
        points: toNumber(entry.points),
        maxPoints: toNumber(entry.max_points),
        model: typeof entry.model === "string" ? entry.model : null,
        breakdown: entry.breakdown ?? null,
        groups: entry.groups ?? null,
      },
    ];
  });
}

function toAttempt(row: Row): ResultAttempt | null {
  // The function types every column non-null; a student with no attempt has them all null.
  if (!row.attempt_id) return null;
  const submitted = row.submitted_at ?? null;
  return {
    id: row.attempt_id,
    number: row.attempt_number,
    submittedAt: submitted,
    autoSubmitted: row.auto_submitted === true,
    score: submitted ? toNumber(row.score) : null,
    maxScore: submitted ? toNumber(row.max_score) : null,
    marks: submitted ? toMarks(row.marks) : null,
  };
}

export async function readMyResult(client: Client, assignmentId: string): Promise<MyResultRead> {
  const { data, error } = await client.rpc("my_assignment_result", {
    target_assignment: assignmentId,
  });
  if (error || !Array.isArray(data)) return { kind: "failed" };
  const [first] = data;
  if (!first) return { kind: "withheld" };
  return {
    kind: "released",
    result: {
      assignmentId: first.assignment_id,
      title: first.title,
      closesAt: first.closes_at,
      maxAttempts: first.max_attempts,
      itemSet: toItemSet(first.item_set),
      patientRecord: first.patient_record ?? null,
      attempts: data.flatMap((row) => {
        const attempt = toAttempt(row);
        return attempt ? [attempt] : [];
      }),
    },
  };
}
