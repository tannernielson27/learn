import Link from "next/link";
import {
  attemptProgressLabel,
  studentAssignmentPath,
  type AttemptProgress,
} from "@/lib/assignments/assignments";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { LocalTime } from "./LocalTime";

export interface StudentAssignmentListProps {
  assignments: readonly AssignmentSummary[];
  /** Class id to name, from the student's own classes. */
  classNames: ReadonlyMap<string, string>;
  /** This student's attempts per assignment (#208); an assignment with none is absent. */
  progress?: ReadonlyMap<string, AttemptProgress>;
}

/**
 * A student's open assignments (#207): what, for which class, until when, and (#208) how their
 * attempts stand. Each title opens the assignment, where it is started, resumed or shown submitted.
 */
export function StudentAssignmentList({
  assignments,
  classNames,
  progress = new Map(),
}: StudentAssignmentListProps) {
  if (assignments.length === 0) {
    return <p className="text-ink-2">Nothing is open right now.</p>;
  }

  return (
    <ul
      aria-label="Open assignments"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {assignments.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 px-2 py-3">
          <Link
            href={studentAssignmentPath(entry.id)}
            className="tap-target inline-flex items-center font-medium break-words text-ink-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            {entry.title}
          </Link>
          <span className="text-sm text-ink-2">
            {classNames.get(entry.classId) ?? "Your class"} ·{" "}
            {attemptProgressLabel(entry.maxAttempts, progress.get(entry.id))}
          </span>
          <span className="text-sm text-ink-2">
            Closes <LocalTime iso={entry.closesAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}
