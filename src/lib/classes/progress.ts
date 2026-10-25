import type { Membership, StudentStatus } from "@/lib/assignments/report";
import type { StepRow } from "@/lib/live/report";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import { classTabPath } from "./classTabs";

/**
 * How each student in a class is doing across its live sessions and its assignments: a grid of
 * students by activities, each student's attendance and overall percent, and the class's mean by
 * clinical judgment step. Pure: no React, no Next, no Supabase.
 *
 * The rows are what `public.class_progress` and `public.class_progress_steps` returned to the
 * class's own teacher, who alone can read them. Scores arrive already withheld where the database
 * withholds them (a live session that has not ended, an assignment that has not closed); this
 * module never invents one, and "did not attend" is never read as nought.
 */

export type ActivityKind = "session" | "assignment";

export interface ProgressRowInput {
  profileId: string;
  /** The display name, or the address when there is none. */
  name: string;
  email: string;
  membership: Membership;
  kind: ActivityKind;
  activityId: string;
  title: string;
  /** A live session's start; an assignment's close. */
  occurredAt: string;
  /** A live session's status; an assignment's window (scheduled, open, closed). */
  state: string;
  attended: boolean;
  /** An assignment's status; null for a live session. */
  status: StudentStatus | null;
  attemptsUsed: number | null;
  attemptNumber: number | null;
  points: number | null;
  possible: number | null;
  /** 0-100, or null when there is no score to show. */
  percent: number | null;
}

export interface ProgressStepInput {
  profileId: string;
  step: CjmmStep;
  answered: number;
  /** The mean of the student's answers at this step, each counting once; 0-100. */
  meanPercent: number | null;
}

export interface ClassProgressInput {
  rows: readonly ProgressRowInput[];
  steps: readonly ProgressStepInput[];
}

export interface ProgressActivity {
  kind: ActivityKind;
  id: string;
  title: string;
  occurredAt: string;
  state: string;
}

export interface ProgressCell {
  kind: ActivityKind;
  activityId: string;
  /** A linked participant in the live session; any attempt at the assignment. */
  attended: boolean;
  status: StudentStatus | null;
  attemptNumber: number | null;
  percent: number | null;
  /** The activity's state, so a cell can say "Not ended yet" or "Open". */
  state: string;
}

export interface StudentStep {
  step: CjmmStep;
  label: string;
  answered: number;
  meanPercent: number | null;
}

export interface ProgressStudent {
  profileId: string;
  name: string;
  email: string;
  membership: Membership;
  /** One per activity, in the activities' order. */
  cells: ProgressCell[];
  /** Ended class live sessions this student was linked in. */
  sessionsAttended: number;
  /** Assignments with a submitted attempt. */
  assignmentsSubmitted: number;
  /** The mean of every percent the student has, each activity counting once; null when none. */
  overallPercent: number | null;
  /** How many activities the overall percent is the mean of. */
  scoredCount: number;
  /** Step 1 first; only the steps the student answered something at. */
  steps: StudentStep[];
}

export interface ClassProgress {
  /** Oldest first, live sessions and assignments together. */
  activities: ProgressActivity[];
  /** The class as it stands, by name. */
  students: ProgressStudent[];
  /** Students taken off the class who left something behind, by name; outside every class figure. */
  removed: ProgressStudent[];
  /** Ended class live sessions: what attendance is out of. */
  sessionsEnded: number;
  /** Assignments that have opened: what "submitted" is out of. */
  assignmentsOpened: number;
  /** The class's mean by step: each member's own step percent, each member counting once. */
  steps: StepRow[];
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Live sessions and assignments, oldest first; the same moment goes by kind, then id. */
function byOccurrence(a: ProgressActivity, b: ProgressActivity): number {
  return (
    a.occurredAt.localeCompare(b.occurredAt) ||
    a.kind.localeCompare(b.kind) ||
    a.id.localeCompare(b.id)
  );
}

/** Alphabetical, ignoring case; the same name twice goes by address, then id. */
export function byStudentName(
  a: Pick<ProgressStudent, "name" | "email" | "profileId">,
  b: Pick<ProgressStudent, "name" | "email" | "profileId">,
): number {
  return (
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
    a.email.localeCompare(b.email) ||
    a.profileId.localeCompare(b.profileId)
  );
}

const keyOf = (profileId: string, activityId: string) => `${profileId}@${activityId}`;

const STEPS: readonly CjmmStep[] = [1, 2, 3, 4, 5, 6];

function studentSteps(steps: readonly ProgressStepInput[]): StudentStep[] {
  return [...steps]
    .sort((a, b) => a.step - b.step)
    .map((step) => ({
      step: step.step,
      label: CJMM_STEP_LABELS[step.step],
      answered: step.answered,
      meanPercent: step.meanPercent,
    }));
}

/** The class's step rows from its members' own: `StepRow`, so the report's step bars draw them. */
export function classSteps(students: readonly ProgressStudent[]): StepRow[] {
  return STEPS.flatMap((step) => {
    const held = students.flatMap((student) =>
      student.steps.filter((entry) => entry.step === step),
    );
    if (held.length === 0) return [];
    return [
      {
        step,
        label: CJMM_STEP_LABELS[step],
        // The step bars read this as "questions"; here it is the students with an answer at it.
        itemCount: held.length,
        responded: held.reduce((sum, entry) => sum + entry.answered, 0),
        meanPercent: mean(
          held.flatMap((entry) => (entry.meanPercent === null ? [] : [entry.meanPercent])),
        ),
      },
    ];
  });
}

export function buildClassProgress(input: ClassProgressInput): ClassProgress {
  const activities = new Map<string, ProgressActivity>();
  const people = new Map<
    string,
    Pick<ProgressStudent, "profileId" | "name" | "email" | "membership">
  >();
  const rows = new Map<string, ProgressRowInput>();
  for (const row of input.rows) {
    if (!activities.has(row.activityId)) {
      activities.set(row.activityId, {
        kind: row.kind,
        id: row.activityId,
        title: row.title,
        occurredAt: row.occurredAt,
        state: row.state,
      });
    }
    if (!people.has(row.profileId)) {
      people.set(row.profileId, {
        profileId: row.profileId,
        name: row.name,
        email: row.email,
        membership: row.membership,
      });
    }
    rows.set(keyOf(row.profileId, row.activityId), row);
  }
  const ordered = [...activities.values()].sort(byOccurrence);

  const stepsOf = new Map<string, ProgressStepInput[]>();
  for (const step of input.steps) {
    if (!people.has(step.profileId)) continue;
    stepsOf.set(step.profileId, [...(stepsOf.get(step.profileId) ?? []), step]);
  }

  const students = [...people.values()].map((person): ProgressStudent => {
    const cells = ordered.map((activity): ProgressCell => {
      const row = rows.get(keyOf(person.profileId, activity.id));
      return {
        kind: activity.kind,
        activityId: activity.id,
        attended: row?.attended ?? false,
        status: row?.status ?? (activity.kind === "assignment" ? "not_started" : null),
        attemptNumber: row?.attemptNumber ?? null,
        percent: row?.percent ?? null,
        state: activity.state,
      };
    });
    const percents = cells.flatMap((cell) => (cell.percent === null ? [] : [cell.percent]));
    return {
      ...person,
      cells,
      sessionsAttended: cells.filter(
        (cell) => cell.kind === "session" && cell.state === "ended" && cell.attended,
      ).length,
      assignmentsSubmitted: cells.filter(
        (cell) => cell.kind === "assignment" && cell.status === "submitted",
      ).length,
      overallPercent: mean(percents),
      scoredCount: percents.length,
      steps: studentSteps(stepsOf.get(person.profileId) ?? []),
    };
  });

  const members = students.filter((s) => s.membership === "member").sort(byStudentName);
  return {
    activities: ordered,
    students: members,
    removed: students.filter((s) => s.membership === "removed").sort(byStudentName),
    sessionsEnded: ordered.filter((a) => a.kind === "session" && a.state === "ended").length,
    assignmentsOpened: ordered.filter((a) => a.kind === "assignment" && a.state !== "scheduled")
      .length,
    steps: classSteps(members),
  };
}

// ---------------------------------------------------------------------------
// Sorting and the weakest students
// ---------------------------------------------------------------------------

export const PROGRESS_SORTS = ["name", "overall"] as const;
export type ProgressSort = (typeof PROGRESS_SORTS)[number];

export const PROGRESS_SORT_LABELS: Readonly<Record<ProgressSort, string>> = {
  name: "Name",
  overall: "Overall, lowest first",
};

/** Anything that is not a known sort (a typo, a repeated parameter) is by name. */
export function parseProgressSort(value: unknown): ProgressSort {
  return PROGRESS_SORTS.find((sort) => sort === value) ?? "name";
}

/**
 * The grid's rows in the chosen order. "Overall" puts the lowest first, so the students who need
 * the teacher are at the top; a student with no score yet goes after everyone with one, since
 * nothing says how they are doing. Ties, and every name sort, go by name.
 */
export function sortStudents(
  students: readonly ProgressStudent[],
  sort: ProgressSort,
): ProgressStudent[] {
  if (sort === "name") return [...students].sort(byStudentName);
  return [...students].sort((a, b) => {
    if (a.overallPercent === null || b.overallPercent === null) {
      if (a.overallPercent === b.overallPercent) return byStudentName(a, b);
      return a.overallPercent === null ? 1 : -1;
    }
    return a.overallPercent - b.overallPercent || byStudentName(a, b);
  });
}

/** How many students the "lowest overall" list names at most. */
export const WEAKEST_LIMIT = 3;

/**
 * The students with the lowest overall percent, lowest first, at most `limit`. Only students with
 * a score are named: a student with nothing scored is not "weak", and the attendance column already
 * says they have not taken part.
 */
export function weakestStudents(
  students: readonly ProgressStudent[],
  limit: number = WEAKEST_LIMIT,
): ProgressStudent[] {
  return sortStudents(
    students.filter((s) => s.overallPercent !== null),
    "overall",
  ).slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------
// What a cell says
// ---------------------------------------------------------------------------

/** An en dash: the tables' mark for "nothing to show". */
const NONE = "–";

/**
 * The words in a cell, so it never relies on its shading: a percent when there is one, and
 * otherwise what happened ("Absent", "Not started") or why there is no score yet.
 */
export function cellText(cell: ProgressCell): string {
  if (cell.percent !== null) return `${Math.round(cell.percent)}%`;
  if (cell.kind === "session") {
    if (!cell.attended) return cell.state === "ended" ? "Absent" : NONE;
    return cell.state === "ended" ? "Joined" : "In progress";
  }
  if (cell.state === "scheduled") return "Not open";
  if (cell.status === "in_progress") return "In progress";
  if (cell.status === "submitted") return "Submitted";
  return cell.state === "closed" ? "Missed" : "Not started";
}

/** "3 of 4": attendance as a sentence fragment. */
export function attendanceText(attended: number, held: number): string {
  return `${attended} of ${held}`;
}

/** The share of the heat a cell gets: its percent, as 0 to 1; none without a percent. */
export function heatShare(percent: number | null): number {
  if (percent === null) return 0;
  return Math.min(Math.max(percent, 0), 100) / 100;
}

/** The Progress tab in one sort; by name is the tab's own address. */
export function progressTabPath(classId: string, sort: ProgressSort = "name"): string {
  const base = classTabPath(classId, "progress");
  return sort === "name" ? base : `${base}&sort=${sort}`;
}
