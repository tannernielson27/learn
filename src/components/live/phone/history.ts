/**
 * What one phone saw of a live session, for its end screen (PhoneEnded mockup): how many it
 * answered, how many were all correct, and which are worth another look.
 *
 * Only what this phone already holds: its own answers, and each reveal it was sent with its own
 * marks (ADR 0003 sends a phone nothing else). Kept in the tab's session storage by the room, so
 * a reload in the middle of a session does not wipe it; a phone that joined late simply has
 * fewer entries. The teacher's report is the record; this is a student's reminder.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */

export interface SeenItem {
  position: number;
  itemId: string;
  /** The question's clinical judgment step, when it has one. */
  cjmmStep: number | null;
  /** Whether this phone sent an answer. */
  answered: boolean;
  /** This phone's marks, once the answer was shown; null before or without an answer. */
  points: number | null;
  maxPoints: number | null;
  /** Whether the answer was shown on this phone. */
  revealed?: boolean;
}

export type PhoneHistory = readonly SeenItem[];

export const EMPTY_HISTORY: PhoneHistory = [];

/** Folds what was just learned about one question into the history. Same history if nothing. */
export function noteItem(history: PhoneHistory, next: SeenItem): PhoneHistory {
  const held = history.find((entry) => entry.position === next.position);
  const merged: SeenItem =
    held === undefined || held.itemId !== next.itemId
      ? next
      : {
          ...held,
          cjmmStep: next.cjmmStep ?? held.cjmmStep,
          answered: held.answered || next.answered,
          points: next.points ?? held.points,
          maxPoints: next.maxPoints ?? held.maxPoints,
          ...(held.revealed || next.revealed ? { revealed: true } : {}),
        };
  if (held !== undefined && JSON.stringify(held) === JSON.stringify(merged)) return history;
  return [...history.filter((entry) => entry.position !== next.position), merged].sort(
    (a, b) => a.position - b.position,
  );
}

export interface EndTally {
  answered: number;
  /** Answers marked full marks. */
  allCorrect: number;
  /** Answers that came back with marks. */
  marked: number;
  worthALook: SeenItem[];
}

const partly = (entry: SeenItem): boolean =>
  entry.points !== null && entry.maxPoints !== null && entry.points < entry.maxPoints;

export function endTally(history: PhoneHistory): EndTally {
  const marked = history.filter((entry) => entry.points !== null && entry.maxPoints !== null);
  return {
    answered: history.filter((entry) => entry.answered).length,
    allCorrect: marked.filter((entry) => entry.points === entry.maxPoints).length,
    marked: marked.length,
    worthALook: history.filter(
      (entry) => partly(entry) || (!entry.answered && entry.revealed === true),
    ),
  };
}

/** "Not correct", "2 of 3", "Not answered". */
export function worthWords(entry: SeenItem): string {
  if (!entry.answered) return "Not answered";
  if (entry.points === 0) return "Not correct";
  return `${entry.points ?? 0} of ${entry.maxPoints ?? 0}`;
}

const isSeen = (value: unknown): value is SeenItem => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  const numberOrNull = (field: unknown) => field === null || typeof field === "number";
  return (
    typeof entry.position === "number" &&
    typeof entry.itemId === "string" &&
    numberOrNull(entry.cjmmStep) &&
    typeof entry.answered === "boolean" &&
    numberOrNull(entry.points) &&
    numberOrNull(entry.maxPoints)
  );
};

/** What session storage held, or an empty history for anything unreadable. */
export function parseHistory(stored: string | null): PhoneHistory {
  if (stored === null) return EMPTY_HISTORY;
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isSeen) ? parsed : EMPTY_HISTORY;
  } catch {
    return EMPTY_HISTORY;
  }
}
