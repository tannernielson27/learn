import { attemptsLabel } from "@/lib/assignments/assignments";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { LocalTime } from "./LocalTime";

export interface StudentAssignmentListProps {
  assignments: readonly AssignmentSummary[];
  /** Class id to name, from the student's own classes. */
  classNames: ReadonlyMap<string, string>;
}

/**
 * A student's open assignments (#207): what, for which class, and until when. Taking one is #208,
 * so nothing here links anywhere yet.
 */
export function StudentAssignmentList({ assignments, classNames }: StudentAssignmentListProps) {
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
          <span className="font-medium break-words text-ink-1">{entry.title}</span>
          <span className="text-sm text-ink-2">
            {classNames.get(entry.classId) ?? "Your class"} · {attemptsLabel(entry.maxAttempts)}
          </span>
          <span className="text-sm text-ink-2">
            Closes <LocalTime iso={entry.closesAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}
