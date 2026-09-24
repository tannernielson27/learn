import Link from "next/link";
import {
  attemptProgressLabel,
  studentAssignmentPath,
  type AttemptProgress,
} from "@/lib/assignments/assignments";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { ClassTime } from "./ClassTime";

/** What a student's lists need to know about each of their classes. */
export interface StudentClassInfo {
  name: string;
  /** The zone its due times are shown in (#242). */
  timeZone: string;
}

export interface StudentAssignmentListProps {
  assignments: readonly AssignmentSummary[];
  /** Class id to name and zone, from the student's own classes. */
  classes: ReadonlyMap<string, StudentClassInfo>;
  /** This student's attempts per assignment (#208); an assignment with none is absent. */
  progress?: ReadonlyMap<string, AttemptProgress>;
}

/**
 * A student's open assignments (#207): what, for which class, until when, and (#208) how their
 * attempts stand. Each title opens the assignment, where it is started, resumed or shown submitted.
 */
export function StudentAssignmentList({
  assignments,
  classes,
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
            {classes.get(entry.classId)?.name ?? "Your class"} ·{" "}
            {attemptProgressLabel(entry.maxAttempts, progress.get(entry.id))}
          </span>
          <span className="text-sm text-ink-2">
            Closes{" "}
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
