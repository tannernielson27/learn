import Link from "next/link";
import { studentResultsPath } from "@/lib/assignments/assignments";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { LocalTime } from "./LocalTime";

export interface ClosedAssignmentListProps {
  assignments: readonly AssignmentSummary[];
  /** Class id to name, from the student's own classes. */
  classNames: ReadonlyMap<string, string>;
}

/**
 * A student's closed assignments (#210), most recently closed first, each linking to its results:
 * the score, and every item with its key and rationale.
 */
export function ClosedAssignmentList({ assignments, classNames }: ClosedAssignmentListProps) {
  if (assignments.length === 0) {
    return <p className="text-ink-2">Nothing has closed yet.</p>;
  }

  return (
    <ul
      aria-label="Closed assignments"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {assignments.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 px-2 py-3">
          <Link
            href={studentResultsPath(entry.id)}
            className="tap-target inline-flex items-center font-medium break-words text-ink-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            {`Results for ${entry.title}`}
          </Link>
          <span className="text-sm text-ink-2">
            {classNames.get(entry.classId) ?? "Your class"}
          </span>
          <span className="text-sm text-ink-2">
            Closed <LocalTime iso={entry.closesAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}
