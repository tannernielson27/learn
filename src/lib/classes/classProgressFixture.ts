import type { StudentStatus } from "@/lib/assignments/report";
import type { CjmmStep } from "@/lib/ngn/types";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import { CLASS_PAGE_FIXTURE_ASSIGNMENTS, CLASS_PAGE_FIXTURE_ROSTER } from "./classPageFixture";
import type { ClassProgressInput, ProgressRowInput, ProgressStepInput } from "./progress";

/**
 * The class page fixture's class (`classPageFixture.ts`) as `class_progress` would return it at
 * `CLASS_PAGE_FIXTURE_NOW`: its four students, three ended live sessions for the class, its three
 * assignments (one closed, one open, one not yet open), and Jordan, taken off the class after
 * attending once. It drives the progress unit tests, the Progress tab's and the student page's
 * component tests, and the gallery's screenshots. Every name is fictional.
 *
 * By hand: Ana is strong everywhere; Kai missed the second live session and is lowest; Priya joined
 * on 2026-10-20, so she missed the first two and the closed assignment; Sam has nothing yet.
 */

export const PROGRESS_FIXTURE_SESSIONS = [
  {
    id: "00000000-0000-4000-8000-0000000000e1",
    title: "Fluid balance warm-up",
    openedAt: "2026-10-06T15:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-0000000000e2",
    title: "Cardiac assessment",
    openedAt: "2026-10-13T15:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-0000000000e3",
    title: "Heart failure review",
    openedAt: "2026-10-20T15:00:00Z",
  },
] as const;

export const PROGRESS_FIXTURE_REMOVED = {
  profileId: "00000000-0000-4000-8000-0000000000a5",
  email: "jordan.blake@example.test",
  name: "Jordan Blake",
} as const;

type SessionMark = number | "absent";
interface AssignmentMark {
  status: StudentStatus;
  percent?: number;
}

/** Per student: each live session's percent or absence, and each assignment's status. */
const MARKS: Record<string, { sessions: SessionMark[]; assignments: AssignmentMark[] }> = {
  // Ana Reyes
  "00000000-0000-4000-8000-0000000000a1": {
    sessions: [80, 90, 85],
    assignments: [
      { status: "submitted", percent: 88 },
      { status: "in_progress" },
      { status: "not_started" },
    ],
  },
  // Kai Ortiz
  "00000000-0000-4000-8000-0000000000a2": {
    sessions: [60, "absent", 45],
    assignments: [
      { status: "submitted", percent: 52 },
      { status: "not_started" },
      { status: "not_started" },
    ],
  },
  // Priya Shah
  "00000000-0000-4000-8000-0000000000a3": {
    sessions: ["absent", "absent", 70],
    assignments: [{ status: "not_started" }, { status: "submitted" }, { status: "not_started" }],
  },
  // Sam Lee, who has not signed in
  "00000000-0000-4000-8000-0000000000a4": {
    sessions: ["absent", "absent", "absent"],
    assignments: [{ status: "not_started" }, { status: "not_started" }, { status: "not_started" }],
  },
  [PROGRESS_FIXTURE_REMOVED.profileId]: {
    sessions: [40, "absent", "absent"],
    assignments: [
      { status: "submitted", percent: 35 },
      { status: "not_started" },
      { status: "not_started" },
    ],
  },
};

/** The fixture assignments' windows at CLASS_PAGE_FIXTURE_NOW. */
const WINDOWS = ["closed", "open", "scheduled"] as const;

const STEPS: Record<string, [CjmmStep, number][]> = {
  "00000000-0000-4000-8000-0000000000a1": [
    [1, 90],
    [2, 85],
    [3, 80],
    [4, 88],
    [6, 92],
  ],
  "00000000-0000-4000-8000-0000000000a2": [
    [1, 60],
    [2, 40],
    [3, 55],
    [4, 45],
  ],
  "00000000-0000-4000-8000-0000000000a3": [
    [1, 75],
    [2, 65],
    [3, 70],
  ],
  [PROGRESS_FIXTURE_REMOVED.profileId]: [[1, 40]],
};

const PEOPLE = [
  ...CLASS_PAGE_FIXTURE_ROSTER.map((entry) => ({
    profileId: entry.profileId,
    email: entry.email,
    name: entry.displayName ?? entry.email,
    membership: "member" as const,
  })),
  { ...PROGRESS_FIXTURE_REMOVED, membership: "removed" as const },
];

function rowsOf(person: (typeof PEOPLE)[number]): ProgressRowInput[] {
  const marks = MARKS[person.profileId];
  if (!marks) return [];
  const base = {
    profileId: person.profileId,
    name: person.name,
    email: person.email,
    membership: person.membership,
  };
  const sessions = PROGRESS_FIXTURE_SESSIONS.map((session, index): ProgressRowInput => {
    const mark = marks.sessions[index] ?? "absent";
    const attended = mark !== "absent";
    return {
      ...base,
      kind: "session",
      activityId: session.id,
      title: session.title,
      occurredAt: session.openedAt,
      state: "ended",
      attended,
      status: null,
      attemptsUsed: null,
      attemptNumber: null,
      points: attended ? mark / 10 : null,
      possible: attended ? 10 : null,
      percent: attended ? mark : null,
    };
  });
  const assignments = CLASS_PAGE_FIXTURE_ASSIGNMENTS.map((assignment, index): ProgressRowInput => {
    const mark = marks.assignments[index] ?? { status: "not_started" };
    const window = WINDOWS[index] ?? "open";
    const scored = window === "closed" && mark.percent !== undefined;
    return {
      ...base,
      kind: "assignment",
      activityId: assignment.id,
      title: assignment.title,
      occurredAt: assignment.closesAt,
      state: window,
      attended: mark.status !== "not_started",
      status: mark.status,
      attemptsUsed: mark.status === "not_started" ? 0 : 1,
      attemptNumber: scored ? 1 : null,
      points: scored ? (mark.percent ?? 0) / 10 : null,
      possible: scored ? 10 : null,
      percent: scored ? (mark.percent ?? null) : null,
    };
  });
  return [...sessions, ...assignments];
}

export const PROGRESS_FIXTURE: ClassProgressInput = {
  rows: PEOPLE.flatMap(rowsOf),
  steps: PEOPLE.flatMap((person): ProgressStepInput[] =>
    (STEPS[person.profileId] ?? []).map(([step, meanPercent]) => ({
      profileId: person.profileId,
      step,
      answered: 4,
      meanPercent,
    })),
  ),
};

/** A class with students and nothing run or assigned yet: the Progress tab's empty state. */
export const PROGRESS_FIXTURE_EMPTY: ClassProgressInput = { rows: [], steps: [] };

/** The fixture's live sessions as the Live sessions tab lists them, newest first. */
export const PROGRESS_FIXTURE_SESSION_LIST: SessionSummary[] = PROGRESS_FIXTURE_SESSIONS.map(
  (session, index) => ({
    id: session.id,
    title: session.title,
    status: "ended" as const,
    openedAt: session.openedAt,
    closedAt: session.openedAt.replace("T15:00", "T15:50"),
    participantCount: [5, 3, 6][index] ?? 0,
  }),
).reverse();
