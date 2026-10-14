import { countLabel, parseSelection } from "./folders";
import { isUuid } from "./ids";

/**
 * Moving questions and case studies to another quiz, and turning an in-quiz folder into a quiz
 * (#417). The words, the form reading and the refusals; the calls are in quizMoveData.ts and the
 * database side in 20261014300000_move_between_quizzes.sql.
 */

/** Another quiz in the workspace, as the quiz picker lists it. */
export interface QuizOption {
  id: string;
  name: string;
}

/** What uses the quiz in hand, and so keeps what it was given when questions leave it. */
export interface QuizUses {
  /** Assignments of this quiz that have not closed, open or still to open. */
  assignments: number;
  /** Live sessions run from this quiz, each with a report. */
  liveSessions: number;
  /** The classes this quiz is shared with for practice, by name. */
  practiceClasses: readonly string[];
}

export type QuizMoveFormResult =
  | { ok: true; quizId: string; itemIds: string[]; caseStudyIds: string[] }
  | { ok: false; error: string };

export const QUIZ_MOVE_NOT_READY = "Moving to another quiz is not ready yet. Try again later.";
export const TURN_NOT_READY = "Turning a folder into a quiz is not ready yet. Try again later.";
const CHANGED = "The selection has changed since this page loaded. Reload the page and try again.";
const QUIZ_GONE = "That quiz no longer exists. Reload the page and try again.";
const FOLDER_GONE = "That folder no longer exists. Reload the page and try again.";

/** Reads a move to another quiz: the chosen `quiz` and the selected questions and case studies. */
export function parseQuizMoveForm(formData: FormData): QuizMoveFormResult {
  const quiz = formData.get("quiz");
  if (typeof quiz !== "string" || !isUuid(quiz)) {
    return { ok: false, error: "Choose a quiz to move to." };
  }
  const selection = parseSelection(formData);
  return selection.ok ? { ...selection, quizId: quiz } : selection;
}

/** "2 questions and 1 case study", or "nothing" when the selection is empty. */
export function selectionLabel(counts: { items: number; caseStudies: number }): string {
  const parts = [
    countLabel(counts.items, "question", "questions"),
    countLabel(counts.caseStudies, "case study", "case studies"),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? "nothing" : parts.join(" and ");
}

const listOf = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * What does not follow a question out of this quiz, one line each, for the confirm step. Every line
 * is about the quiz in hand; when nothing uses it, one line says so.
 */
export function staysBehind(uses: QuizUses): string[] {
  const lines: string[] = [];
  if (uses.assignments > 0) {
    lines.push(
      uses.assignments === 1
        ? "Its assignment keeps the questions it was given."
        : `Its ${uses.assignments} assignments keep the questions they were given.`,
    );
  }
  if (uses.liveSessions > 0) {
    lines.push(
      uses.liveSessions === 1
        ? "Its live session report keeps its questions."
        : `Its ${uses.liveSessions} live session reports keep their questions.`,
    );
  }
  if (uses.practiceClasses.length > 0) {
    lines.push(`Practice with ${listOf(uses.practiceClasses)} stays with this quiz.`);
  }
  if (lines.length === 0) {
    lines.push("No assignment, live session or practice uses this quiz yet.");
  }
  return lines;
}

/**
 * The name the database gives a folder turned into a quiz: the folder's own, or with " (2)",
 * " (3)" and so on when a quiz in the workspace already reads the same, whatever its case.
 */
export function newQuizName(folderName: string, quizNames: readonly string[]): string {
  const taken = new Set(quizNames.map((name) => name.toLowerCase()));
  let name = folderName;
  for (let suffix = 2; taken.has(name.toLowerCase()); suffix += 1) {
    name = `${folderName} (${suffix})`;
  }
  return name;
}

/** What a move did. */
export function quizMoveDone(
  moved: { items: number; caseStudies: number },
  quizName: string,
): string {
  return `Moved ${selectionLabel(moved)} to ${quizName}.`;
}

interface DbError {
  code?: string;
  hint?: string | null;
  details?: string | null;
}

/** A function the database does not have yet: PostgREST's schema cache, or Postgres's own. */
export function isMissingFunctionError(error: DbError | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/** A plain reason for a refused move, from move_to_quiz's codes and hints. */
export function quizMoveError(error: DbError): string {
  if (isMissingFunctionError(error)) return QUIZ_MOVE_NOT_READY;
  switch (error.code) {
    case "2BP01":
      return `That question is step ${error.hint ?? ""} of the case study "${error.details ?? ""}". Select the case study to move it.`;
    case "P0002":
      return error.hint === "quiz" ? QUIZ_GONE : CHANGED;
    case "22023":
      if (error.hint === "limit") return "Move at most 200 at a time.";
      if (error.hint === "empty") return "Select at least one question or case study to move.";
      return "Choose another quiz to move to.";
    default:
      return "The selection could not be moved. Try again.";
  }
}

/** A plain reason for a refused turn, from turn_folder_into_quiz's codes. */
export function turnFolderError(error: DbError, folderName: string): string {
  if (isMissingFunctionError(error)) return TURN_NOT_READY;
  switch (error.code) {
    case "P0002":
      return FOLDER_GONE;
    case "22023":
      return `"${folderName}" holds no questions or case studies of its own. Delete it instead.`;
    default:
      return "The folder could not be turned into a quiz. Try again.";
  }
}
