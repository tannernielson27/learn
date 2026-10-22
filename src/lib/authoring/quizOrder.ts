import { isUuid } from "./ids";
import { isMissingFunctionError } from "./quizMove";
import { RATE_LIMIT_ERRORS } from "./rateLimit";

/**
 * A quiz's one order for its questions and case studies (#468): moving an entry, reading the
 * Change order form, and the words for a refusal. The reads and the save are in quizOrderData.ts,
 * the screen in src/components/authoring/QuizOrderEditor.tsx, and the database side in
 * 20261021000000_quiz_order.sql. Pure, so the client editor and the server share it.
 */

/** One entry in a quiz's order: a loose question or a case study (never a case study's step). */
export interface QuizEntry {
  kind: "item" | "case_study";
  id: string;
  /** The question's stem excerpt, or the case study's title. */
  label: string;
  /** The question's format ("Multiple Choice"), or "Case study". */
  format: string;
  /** "Draft" or "Published". Archived entries are not in the order. */
  status: string;
}

/** The most entries one quiz's order holds; reorder_quiz holds the same line. */
export const QUIZ_ORDER_MAX = 1000;

/** The form field that carries each entry's id, in the new order. */
export const QUIZ_ORDER_FIELD = "entry";

export type Direction = "up" | "down";

export const QUIZ_ORDER_ERRORS = {
  changed: "This quiz has changed since the page loaded. Reload the page and try again.",
  tooMany: `A quiz can be put in order with at most ${QUIZ_ORDER_MAX} questions and case studies.`,
  gone: "That quiz no longer exists.",
  limited: RATE_LIMIT_ERRORS.limited,
  notReady: "Changing the order is not ready yet. Try again later.",
  failed: "The order could not be saved. Try again.",
} as const;

/** A new order with one entry moved one place; a move past either end changes nothing. */
export function moveEntry(order: readonly string[], id: string, direction: Direction): string[] {
  const from = order.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  return moveIndex(order, from, to);
}

/** A new order with a dragged entry put where the entry it was dropped on stood. */
export function moveEntryTo(order: readonly string[], id: string, overId: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...order];
  return moveIndex(order, from, to);
}

function moveIndex(order: readonly string[], from: number, to: number): string[] {
  const next = order.filter((_, index) => index !== from);
  return [...next.slice(0, to), order[from] as string, ...next.slice(to)];
}

/** Whether a new order differs from the saved one. */
export function orderChanged(saved: readonly string[], next: readonly string[]): boolean {
  return saved.length !== next.length || saved.some((id, index) => next[index] !== id);
}

/** What the status region says after a move: "Sepsis, position 2 of 4." */
export function positionMessage(label: string, index: number, count: number): string {
  return `${label}, position ${index + 1} of ${count}.`;
}

export type QuizOrderFormResult = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * The entries' ids in the order the form holds them. Anything but distinct ids is a page that no
 * longer matches the quiz; the database checks the set itself (22023, hint 'stale').
 */
export function parseQuizOrderForm(formData: FormData): QuizOrderFormResult {
  const values = formData.getAll(QUIZ_ORDER_FIELD);
  if (values.length > QUIZ_ORDER_MAX) return { ok: false, error: QUIZ_ORDER_ERRORS.tooMany };
  const ids = values.filter((value): value is string => typeof value === "string");
  if (
    ids.length === 0 ||
    ids.length !== values.length ||
    !ids.every(isUuid) ||
    new Set(ids).size !== ids.length
  ) {
    return { ok: false, error: QUIZ_ORDER_ERRORS.changed };
  }
  return { ok: true, ids };
}

interface DbError {
  code?: string;
  hint?: string | null;
}

/** A plain reason for a refused save, from reorder_quiz's codes. */
export function quizOrderError(error: DbError): string {
  if (isMissingFunctionError(error)) return QUIZ_ORDER_ERRORS.notReady;
  switch (error.code) {
    case "22023":
      return QUIZ_ORDER_ERRORS.changed;
    case "P0002":
      return QUIZ_ORDER_ERRORS.gone;
    case "54000":
      return QUIZ_ORDER_ERRORS.limited;
    default:
      return QUIZ_ORDER_ERRORS.failed;
  }
}
