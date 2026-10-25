/**
 * A student's ended live sessions on their home page, as rows: each session's title, class, when
 * it ended, their own score and how many questions they answered. The rows come from
 * `public.my_live_results`, which answers only the caller, only about sessions that have ended and
 * participant rows linked to them; nothing here decides who may see what.
 *
 * Pure TypeScript: no React, Next or Supabase. Types only from the reader.
 */
import type { LiveResultSummary } from "@/lib/supabase/liveResults";

/** Where a student reads one live session's results. `/live/[sessionId]` is the teacher's. */
export const studentLiveResultPath = (sessionId: string): string => `/learn/live/${sessionId}`;

export interface LiveHistoryRow {
  id: string;
  title: string;
  classId: string | null;
  /** As the session's class is named now; null when the class has been deleted. */
  className: string | null;
  closedAt: string | null;
  points: number;
  possible: number;
  /** 0-100, or null when nothing was worth anything. */
  percent: number | null;
  answered: number;
  questionCount: number;
}

export function buildLiveHistory(summaries: readonly LiveResultSummary[]): LiveHistoryRow[] {
  return summaries.map((summary) => ({
    id: summary.sessionId,
    title: summary.title,
    classId: summary.classId,
    className: summary.className,
    closedAt: summary.closedAt,
    points: summary.points,
    possible: summary.possible,
    percent: summary.possible > 0 ? (summary.points / summary.possible) * 100 : null,
    answered: summary.answered,
    questionCount: summary.questionCount,
  }));
}

/** "Answered 2 of 3 questions". */
export function answeredLabel({
  answered,
  questionCount,
}: Pick<LiveHistoryRow, "answered" | "questionCount">): string {
  if (questionCount === 0) return "No questions";
  const noun = questionCount === 1 ? "question" : "questions";
  return `Answered ${answered} of ${questionCount} ${noun}`;
}
