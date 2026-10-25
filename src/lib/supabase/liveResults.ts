import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/authoring/ids";
import type { Database, Json } from "./database.types";
import type { StepAttemptMark } from "./steps";

/**
 * A student's own live session results, through `public.my_live_results`, `public.my_live_result`
 * and `public.my_live_step_marks` (20261025010000_student_live_results.sql), as the student.
 *
 * Each function answers only the caller, only about participant rows linked to their account, and
 * only for sessions that have ended. So for one session "no rows" means "not yours to read": not
 * ended, not linked to you, or no such session; the page says not-found for all three, and must
 * not read a key before `readMyLiveResult` says `found`.
 */

type Client = SupabaseClient<Database>;

/** One question's place and the student's own two numbers. Points null when they did not answer. */
export interface LiveMark {
  position: number;
  points: number | null;
  maxPoints: number;
}

export interface LiveResultSummary {
  sessionId: string;
  title: string;
  /** Null when the class has since been deleted. */
  classId: string | null;
  className: string | null;
  closedAt: string | null;
  questionCount: number;
  answered: number;
  points: number;
  possible: number;
  marks: LiveMark[];
}

/** The student's own answer to one question, and the key it was scored against, unparsed. */
export interface LiveAnswer {
  response: unknown;
  points: number | null;
  maxPoints: number | null;
  model: string | null;
  breakdown: unknown;
  groups: unknown;
  reveal: unknown;
}

export interface LiveQuestion {
  position: number;
  itemId: string;
  /** Their mark's maximum, or the item's own when they left it blank. */
  maxPoints: number;
  answer: LiveAnswer | null;
}

export interface MyLiveResult {
  sessionId: string;
  title: string;
  classId: string | null;
  className: string | null;
  closedAt: string | null;
  /** A case-study session's record snapshot, unparsed. */
  patientRecord: Json | null;
  /** A whole-quiz session's case studies played in place, unparsed. */
  caseStudyRecords: Json | null;
  /** The questions the session reached, in order. */
  questions: LiveQuestion[];
}

export type MyLiveResultRead =
  { kind: "failed" } | { kind: "missing" } | { kind: "found"; result: MyLiveResult };

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

const isObject = (value: unknown): value is Record<string, Json | undefined> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPosition = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/** Stored JSON is external input: a mark that is not a well-formed one is left out. */
function toMarks(value: Json | null | undefined): LiveMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isObject(entry) || !isPosition(entry.position)) return [];
    const maxPoints = toNumber(entry.max_points);
    if (maxPoints === null) return [];
    return [{ position: entry.position, points: toNumber(entry.points), maxPoints }];
  });
}

type ListRow = Database["public"]["Functions"]["my_live_results"]["Returns"][number];

function toSummary(row: ListRow): LiveResultSummary[] {
  const points = toNumber(row.points);
  const possible = toNumber(row.possible);
  const questionCount = toNumber(row.question_count);
  const answered = toNumber(row.answered);
  if (points === null || possible === null || questionCount === null || answered === null) {
    return [];
  }
  return [
    {
      sessionId: row.session_id,
      title: row.title,
      classId: row.class_id ?? null,
      className: row.class_name ?? null,
      closedAt: row.closed_at ?? null,
      questionCount,
      answered,
      points,
      possible,
      marks: toMarks(row.marks),
    },
  ];
}

/** The student's ended live sessions, most recently ended first. Null on an error. */
export async function readMyLiveResults(client: Client): Promise<LiveResultSummary[] | null> {
  const { data, error } = await client.rpc("my_live_results");
  if (error || !Array.isArray(data)) return null;
  return data.flatMap(toSummary);
}

function toAnswer(value: Json | undefined): LiveAnswer | null {
  if (!isObject(value)) return null;
  return {
    response: value.response ?? null,
    points: toNumber(value.points),
    maxPoints: toNumber(value.max_points),
    model: typeof value.model === "string" ? value.model : null,
    breakdown: value.breakdown ?? null,
    groups: value.groups ?? null,
    reveal: value.reveal ?? null,
  };
}

function toQuestions(value: Json | null | undefined): LiveQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isObject(entry) || !isPosition(entry.position)) return [];
    const itemId = entry.item_id;
    const maxPoints = toNumber(entry.max_points);
    if (typeof itemId !== "string" || !isUuid(itemId) || maxPoints === null) return [];
    return [{ position: entry.position, itemId, maxPoints, answer: toAnswer(entry.answer) }];
  });
}

/** One ended session of the student's own, with their answers. */
export async function readMyLiveResult(
  client: Client,
  sessionId: string,
): Promise<MyLiveResultRead> {
  const { data, error } = await client.rpc("my_live_result", { target_session: sessionId });
  if (error || !Array.isArray(data)) return { kind: "failed" };
  const [row] = data;
  if (!row) return { kind: "missing" };
  return {
    kind: "found",
    result: {
      sessionId: row.session_id,
      title: row.title,
      classId: row.class_id ?? null,
      className: row.class_name ?? null,
      closedAt: row.closed_at ?? null,
      patientRecord: row.patient_record ?? null,
      caseStudyRecords: row.case_study_records ?? null,
      questions: toQuestions(row.questions),
    },
  };
}

/** The student's live answers by step, for "Your clinical judgment steps". Null on an error. */
export async function readMyLiveStepMarks(client: Client): Promise<StepAttemptMark[] | null> {
  const { data, error } = await client.rpc("my_live_step_marks");
  if (error || !Array.isArray(data)) return null;
  return data.flatMap((row) => {
    const points = toNumber(row.points);
    const maxPoints = toNumber(row.max_points);
    if (points === null || maxPoints === null) return [];
    const step = typeof row.cjmm_step === "number" ? row.cjmm_step : null;
    return [{ cjmmStep: step, points, maxPoints }];
  });
}
