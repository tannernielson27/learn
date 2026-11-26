import type { SupabaseClient } from "@supabase/supabase-js";
import {
  USE_KINDS,
  type QuestionAnswer,
  type QuestionMark,
  type QuestionStatsInput,
  type UseKind,
} from "@/lib/ngn/questionStats";
import type { Item } from "@/lib/ngn/schemas";
import type { Database } from "./database.types";
import { PAGE_SIZE, readAllPages } from "./sessionReport";

type Client = SupabaseClient<Database>;

/**
 * The reads behind question statistics (#616), and the adapter that turns their rows into #615's
 * `QuestionStatsInput`. Both run as the signed-in teacher. `quiz_question_marks` and
 * `question_answers` (20261126000100_question_stats_reads.sql) answer only an author of the quiz's
 * own workspace, and anyone else gets no rows, so another workspace's quiz reads exactly like one
 * nobody has answered. No service role.
 *
 * What counts is decided in SQL: a live session once it has ended (guests included), an
 * assignment once it has closed (the student's first submitted attempt only), never practice.
 * Whether an answer was scored with the question's current key is decided here, in TS, by #615:
 * each row carries the key it was scored with, and `buildQuestionStats` compares it to the
 * question as it is now (`scoredWithCurrentKey`), so the comparison rules live in one place.
 */

export type QuizQuestionMarkRow =
  Database["public"]["Functions"]["quiz_question_marks"]["Returns"][number];
export type QuestionAnswerRow =
  Database["public"]["Functions"]["question_answers"]["Returns"][number];

/** `question_answers` returns at most this many answers, newest first. */
export const QUESTION_ANSWERS_LIMIT = 2000;

const isUseKind = (value: string): value is UseKind => USE_KINDS.some((kind) => kind === value);

/** numeric over PostgREST is a number, but a driver may hand back a string. */
const toNumber = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

type CommonRow = Pick<
  QuizQuestionMarkRow,
  "use_kind" | "use_id" | "answerer" | "item_id" | "points" | "max_points"
>;

function common(row: CommonRow): Omit<QuestionMark, "reveal"> | null {
  if (!isUseKind(row.use_kind)) return null;
  const points = toNumber(row.points);
  const maxPoints = toNumber(row.max_points);
  if (points === null || maxPoints === null) return null;
  return {
    useKind: row.use_kind,
    useId: row.use_id,
    answerer: row.answerer,
    itemId: row.item_id,
    points,
    maxPoints,
  };
}

/** One marks row as #615's mark; its stored key (answerKey and scoring) becomes `reveal`. */
export function toQuestionMark(row: QuizQuestionMarkRow): QuestionMark | null {
  const base = common(row);
  return base && { ...base, reveal: row.scored_key ?? null };
}

/** One answers row as #615's answer, with its response and its stored reveal. */
export function toQuestionAnswer(row: QuestionAnswerRow): QuestionAnswer | null {
  const base = common(row);
  return base && { ...base, reveal: row.reveal ?? null, response: row.response };
}

/**
 * #615's input from the questions as they are now and the rows read. `answers` holds, per
 * question whose answers were read, that question's `question_answers` rows; a question not in it
 * is `not_read`, and one read with no rows is counted at zero. Rows it does not understand are
 * dropped rather than guessed at.
 */
export function questionStatsInput(input: {
  items: readonly Item[];
  marks: readonly QuizQuestionMarkRow[];
  answers?: Readonly<Record<string, readonly QuestionAnswerRow[]>>;
}): QuestionStatsInput {
  const marks = input.marks.flatMap((row) => toQuestionMark(row) ?? []);
  if (!input.answers) return { items: input.items, marks };
  const answers: Record<string, QuestionAnswer[]> = {};
  for (const [itemId, rows] of Object.entries(input.answers)) {
    answers[itemId] = rows.flatMap((row) => toQuestionAnswer(row) ?? []);
  }
  return { items: input.items, marks, answers };
}

/**
 * Every counted scored answer to every question now in the quiz. A quiz of 50 questions and a
 * few hundred students is past PostgREST's page, so it is read a page at a time, in the function's
 * own order. Throws when a page fails, so a half-read quiz is never shown as a real one.
 */
export async function readQuizQuestionMarks(
  supabase: Client,
  bankId: string,
): Promise<QuizQuestionMarkRow[]> {
  return readAllPages(
    (from, to) => supabase.rpc("quiz_question_marks", { target_bank: bankId }).range(from, to),
    "quiz question marks",
  );
}

/** One question's counted answers with what was answered, newest first, at most the cap. */
export async function readQuestionAnswers(
  supabase: Client,
  itemId: string,
): Promise<QuestionAnswerRow[]> {
  const rows: QuestionAnswerRow[] = [];
  for (let from = 0; from < QUESTION_ANSWERS_LIMIT; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, QUESTION_ANSWERS_LIMIT) - 1;
    const { data, error } = await supabase
      .rpc("question_answers", { target_item: itemId })
      .range(from, to);
    if (error || !data) {
      throw new Error(`could not read question answers: ${error?.message ?? "no data"}`);
    }
    rows.push(...data);
    if (data.length < to - from + 1) break;
  }
  return rows;
}
