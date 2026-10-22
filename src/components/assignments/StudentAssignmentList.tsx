import {
  attemptProgressLabel,
  studentAssignmentPath,
  type AttemptProgress,
} from "@/lib/assignments/assignments";
import { classLabel, type StudentClassInfo } from "@/lib/classes/studentClasses";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { ClassTime } from "./ClassTime";
import { HOME_LIST_CLASSES, HomeRow } from "@/components/learn/HomeRow";
import { EmptyState } from "@/components/ui/EmptyState";

/** What a student's lists need to know about each of their classes. */
export type { StudentClassInfo };

export interface StudentAssignmentListProps {
  assignments: readonly AssignmentSummary[];
  /** Class id to name, zone and (across workspaces) workspace: `studentClassInfo`. */
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
    // Under the student home's Assignments h2.
    return <EmptyState level={3} heading="No open assignments" />;
  }

  return (
    <ul aria-label="Open assignments" className={HOME_LIST_CLASSES}>
      {assignments.map((entry) => (
        <HomeRow key={entry.id} href={studentAssignmentPath(entry.id)} title={entry.title}>
          {/* The workspace is beside the class only for a student in more than one workspace. */}
          {classLabel(classes.get(entry.classId))} ·{" "}
          {attemptProgressLabel(entry.maxAttempts, progress.get(entry.id))} · Closes{" "}
          <ClassTime
            iso={entry.closesAt}
            timeZone={classes.get(entry.classId)?.timeZone ?? DEFAULT_CLASS_TIME_ZONE}
          />
        </HomeRow>
      ))}
    </ul>
  );
}
