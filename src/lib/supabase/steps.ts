import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

/**
 * A student's marks by CJMM step (#239), through `public.my_step_marks`, as the student.
 *
 * The function answers only the caller, only about their own submitted attempts, only for their
 * current classes, and only for assignments that have closed by the database's clock (the same rule
 * as #238's history). Each mark is a step and two numbers: no item id, key, rationale or answer.
 */

type Client = SupabaseClient<Database>;

export interface StepAttemptMark {
  /** As stored; null for an untagged item. Checked against 1-6 by `buildStepStandings`. */
  cjmmStep: number | null;
  points: number;
  maxPoints: number;
}

export interface StepAttempt {
  assignmentId: string;
  number: number;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  marks: StepAttemptMark[];
}

type Row = Database["public"]["Functions"]["my_step_marks"]["Returns"][number];

/**
 * numeric over PostgREST is a number, but a driver may hand back a string. Nothing else is a
 * number here: `Number` would read `[]`, `true` or `""` as a score.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Stored JSON is external input: a mark that is not a well-formed one is left out. */
function toMarks(value: Json | null): StepAttemptMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const points = toNumber(entry.points);
    const maxPoints = toNumber(entry.max_points);
    if (points === null || maxPoints === null) return [];
    const step = typeof entry.cjmm_step === "number" ? entry.cjmm_step : null;
    return [{ cjmmStep: step, points, maxPoints }];
  });
}

function toAttempt(row: Row): StepAttempt {
  return {
    assignmentId: row.assignment_id,
    number: row.attempt_number,
    submittedAt: row.submitted_at ?? null,
    score: toNumber(row.score),
    maxScore: toNumber(row.max_score),
    marks: toMarks(row.marks),
  };
}

/** The student's submitted attempts at closed assignments, with their marks. Null on an error. */
export async function readMyStepAttempts(client: Client): Promise<StepAttempt[] | null> {
  const { data, error } = await client.rpc("my_step_marks");
  if (error || !Array.isArray(data)) return null;
  return data.map(toAttempt);
}
