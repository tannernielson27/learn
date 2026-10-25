/**
 * Who has not answered the question on now, for the teacher's eyes only (QuestionControl
 * mockup). From two things the console already holds: the roster from presence, and the
 * progress read that says which positions each person has answered (`progress()`, the same read
 * the student-paced board makes). Answered or not, never what was answered.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { RosterEntry, SessionProgress } from "@/lib/live";

/** The roster minus whoever has answered `position`; null when that is not known yet. */
export function notAnswered(
  roster: readonly RosterEntry[],
  progress: SessionProgress | null,
  position: number | null,
): RosterEntry[] | null {
  if (progress === null || position === null) return null;
  const answered = new Set(
    progress.rows.filter((row) => row.positions.includes(position)).map((row) => row.participantId),
  );
  return roster.filter((person) => !answered.has(person.participantId));
}

/**
 * How many people have not answered `position`, for ending the timer early; null when that is not
 * known yet. Everyone counts: the whole roster, connected or away (a locked screen is still a
 * student in the room), and anyone the read says has joined whom presence never saw (a phone on
 * the HTTP fallback never tracks presence). Someone who really left keeps it from ending early, and
 * the clock runs out as it would have.
 */
export function stillToAnswer(
  roster: readonly RosterEntry[],
  progress: SessionProgress | null,
  position: number | null,
): number | null {
  const waiting = notAnswered(roster, progress, position);
  if (waiting === null || progress === null || position === null) return null;
  const known = new Set(roster.map((person) => person.participantId));
  const unseen = progress.rows.filter(
    (row) => !known.has(row.participantId) && !row.positions.includes(position),
  );
  return waiting.length + unseen.length;
}
