import Link from "next/link";
import { studentResultsPath } from "@/lib/assignments/assignments";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { ClassTime } from "./ClassTime";
import type { StudentClassInfo } from "./StudentAssignmentList";

export interface ClosedAssignmentListProps {
  assignments: readonly AssignmentSummary[];
  /** Class id to name and zone, from the student's own classes. */
  classes: ReadonlyMap<string, StudentClassInfo>;
}

/**
 * A student's closed assignments (#210), most recently closed first, each linking to its results:
 * the score, and every item with its key and rationale.
 */
export function ClosedAssignmentList({ assignments, classes }: ClosedAssignmentListProps) {
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
            {classes.get(entry.classId)?.name ?? "Your class"}
          </span>
          <span className="text-sm text-ink-2">
            Closed{" "}
            <ClassTime
              iso={entry.closesAt}
              timeZone={classes.get(entry.classId)?.timeZone ?? DEFAULT_CLASS_TIME_ZONE}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
