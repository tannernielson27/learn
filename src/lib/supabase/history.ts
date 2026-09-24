import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * A student's history (#238), through `public.my_assignment_history`, as the student.
 *
 * The function answers only the caller, only about their own attempts, only for their current
 * classes, and only for assignments that have closed by the database's clock (the same rule as
 * #210's results). An assignment still open is simply absent, so no score of it can reach the page.
 */

type Client = SupabaseClient<Database>;

export interface HistoryAttempt {
  id: string;
  number: number;
  submittedAt: string | null;
  /** Null for an attempt still open. */
  score: number | null;
  maxScore: number | null;
}

export interface HistoryAssignment {
  id: string;
  classId: string;
  title: string;
  closesAt: string;
  maxAttempts: number;
  /** Oldest first; empty when the student never started. */
  attempts: HistoryAttempt[];
}

type Row = Database["public"]["Functions"]["my_assignment_history"]["Returns"][number];

/** numeric over PostgREST is a number, but a driver may hand back a string. */
const toNumber = (value: unknown): number | null =>
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);

function toAttempt(row: Row): HistoryAttempt | null {
  // The function types every column non-null; an assignment never started has them all null.
  if (!row.attempt_id) return null;
  const submitted = row.submitted_at ?? null;
  return {
    id: row.attempt_id,
    number: row.attempt_number,
    submittedAt: submitted,
    score: submitted ? toNumber(row.score) : null,
    maxScore: submitted ? toNumber(row.max_score) : null,
  };
}

/** The rows, one per attempt, as one entry per assignment in the order the database gave. */
function groupRows(rows: readonly Row[]): HistoryAssignment[] {
  const order: string[] = [];
  const byId = new Map<string, HistoryAssignment>();
  for (const row of rows) {
    const held = byId.get(row.assignment_id);
    const attempt = toAttempt(row);
    if (!held) order.push(row.assignment_id);
    byId.set(row.assignment_id, {
      id: row.assignment_id,
      classId: row.class_id,
      title: row.title,
      closesAt: row.closes_at,
      maxAttempts: row.max_attempts,
      attempts: [...(held?.attempts ?? []), ...(attempt ? [attempt] : [])],
    });
  }
  return order.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

/** The student's closed assignments with their own attempts. Null on an error. */
export async function readMyHistory(client: Client): Promise<HistoryAssignment[] | null> {
  const { data, error } = await client.rpc("my_assignment_history");
  if (error || !Array.isArray(data)) return null;
  return groupRows(data);
}
