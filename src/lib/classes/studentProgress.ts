import { assignmentReportPath } from "@/lib/assignments/assignments";
import { reportPath } from "@/lib/live/reportFormat";
import type {
  ClassProgress,
  ProgressActivity,
  ProgressCell,
  ProgressStudent,
  StudentStep,
} from "./progress";

/**
 * One student of a class, for their teacher: every class live session and assignment in the order
 * they happened, newest first, and their clinical judgment steps weakest first. Pure: no React,
 * no Next, no Supabase.
 */

export interface TimelineEntry {
  activity: ProgressActivity;
  cell: ProgressCell;
  /** The live session's report once it has ended, its console while it runs; the assignment's report. */
  href: string;
  /** What the link opens, for its accessible name. */
  linkLabel: string;
}

export interface StudentProgress {
  student: ProgressStudent;
  /** Newest first. */
  timeline: TimelineEntry[];
  /** The weakest first; a step with no percent goes last. */
  steps: StudentStep[];
  sessionsEnded: number;
}

function linkOf(activity: ProgressActivity): Pick<TimelineEntry, "href" | "linkLabel"> {
  if (activity.kind === "assignment") {
    return { href: assignmentReportPath(activity.id), linkLabel: "Open the assignment report" };
  }
  return activity.state === "ended"
    ? { href: reportPath(activity.id), linkLabel: "Open the live session report" }
    : { href: `/live/${activity.id}`, linkLabel: "Open the live session" };
}

/** Weakest first; the same percent goes by step number, and a step with no percent goes last. */
export function weakestStepsFirst(steps: readonly StudentStep[]): StudentStep[] {
  return [...steps].sort((a, b) => {
    if (a.meanPercent === null || b.meanPercent === null) {
      if (a.meanPercent === b.meanPercent) return a.step - b.step;
      return a.meanPercent === null ? 1 : -1;
    }
    return a.meanPercent - b.meanPercent || a.step - b.step;
  });
}

/** The student's own view of the class's progress, or null when they are not in it. */
export function studentProgress(
  progress: ClassProgress,
  profileId: string,
): StudentProgress | null {
  const student = [...progress.students, ...progress.removed].find(
    (each) => each.profileId === profileId,
  );
  if (!student) return null;
  const timeline = progress.activities
    .map((activity, index) => ({
      activity,
      cell: student.cells[index] as ProgressCell,
      ...linkOf(activity),
    }))
    .reverse();
  return {
    student,
    timeline,
    steps: weakestStepsFirst(student.steps),
    sessionsEnded: progress.sessionsEnded,
  };
}
