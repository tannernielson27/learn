import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { BANK_LIST_LIMIT } from "./banks";
import { isRateLimitedError, RATE_LIMIT_ERRORS } from "./rateLimit";
import {
  quizMoveDone,
  quizMoveError,
  turnFolderError,
  type QuizOption,
  type QuizUses,
} from "./quizMove";

type Client = SupabaseClient<Database>;

export type QuizMoveWrite<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the quiz page needs to offer a move to another quiz. */
export interface MoveContext {
  /** Every other quiz in the workspace, by name. */
  quizzes: QuizOption[];
  /** What uses this quiz, less its practice shares, which the page reads already. */
  uses: Omit<QuizUses, "practiceClasses">;
}

const fail = <T>(error: string): QuizMoveWrite<T> => ({ ok: false, error });

/**
 * The other quizzes, and how many assignments and live sessions use this one, under RLS. Null
 * when any of it cannot be read: the confirm step would otherwise say less than is true, so the
 * page offers no move rather than an unsure one.
 */
export async function readMoveContext(
  client: Client,
  bankId: string,
  now: Date = new Date(),
): Promise<MoveContext | null> {
  const [quizzes, assignments, sessions] = await Promise.all([
    client
      .from("item_banks")
      .select("id, name")
      .neq("id", bankId)
      .order("name")
      .limit(BANK_LIST_LIMIT),
    client
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("bank_id", bankId)
      .gt("closes_at", now.toISOString()),
    client.from("sessions").select("id", { count: "exact", head: true }).eq("bank_id", bankId),
  ]);
  if (quizzes.error || assignments.error || sessions.error) return null;
  return {
    quizzes: quizzes.data.map((row) => ({ id: row.id, name: row.name })),
    uses: { assignments: assignments.count ?? 0, liveSessions: sessions.count ?? 0 },
  };
}

export interface QuizMove {
  quizId: string;
  itemIds: string[];
  caseStudyIds: string[];
}

/** The function's `{ items, case_studies }` counts; anything else reads as none. */
function readCounts(data: unknown): { items: number; caseStudies: number } {
  const counts = (data ?? {}) as { items?: unknown; case_studies?: unknown };
  const count = (value: unknown) => (typeof value === "number" && value > 0 ? value : 0);
  return { items: count(counts.items), caseStudies: count(counts.case_studies) };
}

/**
 * Moves questions and case studies, each case study with its steps, to another quiz in one
 * database call: all of them or none. Each keeps its id, so its history, tags, and the assignments
 * and reports that name it are untouched.
 */
export async function moveToQuiz(
  client: Client,
  bankId: string,
  move: QuizMove,
): Promise<QuizMoveWrite<{ message: string }>> {
  const { data: target, error: targetError } = await client
    .from("item_banks")
    .select("name")
    .eq("id", move.quizId)
    .maybeSingle();
  if (targetError) return fail(quizMoveError({}));
  if (!target) return fail(quizMoveError({ code: "P0002", hint: "quiz" }));

  const { data, error } = await client.rpc("move_to_quiz", {
    source_bank: bankId,
    target_bank: move.quizId,
    item_ids: move.itemIds,
    case_study_ids: move.caseStudyIds,
  });
  if (isRateLimitedError(error)) return fail(RATE_LIMIT_ERRORS.limited);
  if (error) return fail(quizMoveError(error));
  return { ok: true, value: { message: quizMoveDone(readCounts(data), target.name) } };
}

/** Turns an in-quiz folder, with the folders inside it, into a quiz. Returns the new quiz's id. */
export async function turnFolderIntoQuiz(
  client: Client,
  folderId: string,
  folderName: string,
): Promise<QuizMoveWrite<{ quizId: string }>> {
  const { data, error } = await client.rpc("turn_folder_into_quiz", { target_folder: folderId });
  if (isRateLimitedError(error)) return fail(RATE_LIMIT_ERRORS.limited);
  if (error) return fail(turnFolderError(error, folderName));
  const quizId = (data as { quiz?: unknown } | null)?.quiz;
  if (typeof quizId !== "string") return fail(turnFolderError({}, folderName));
  return { ok: true, value: { quizId } };
}
