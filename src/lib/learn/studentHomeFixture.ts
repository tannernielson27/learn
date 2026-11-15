/**
 * A fictional student's home (#563), for `/gallery/student` and the home's tests: the same shapes
 * the page reads, with no database behind them and no answer key in them. Every name is made up.
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { AttemptProgress } from "@/lib/assignments/assignments";
import type { HistoryRow } from "@/lib/assignments/history";
import { buildStepStandings, type StepMark, type StepStandings } from "@/lib/ngn/stepStandings";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import type { StudentClass } from "@/lib/supabase/classInvites";
import type { PracticeBank } from "@/lib/supabase/practice";
import type { LiveHistoryRow } from "./liveHistory";

const CLASS_A = "00000000-0000-4000-8000-0000005630c1";
const CLASS_B = "00000000-0000-4000-8000-0000005630c2";

/** One workspace, two classes: the workspace's name is not shown beside either. */
export const HOME_FIXTURE_CLASSES: readonly StudentClass[] = [
  {
    id: CLASS_A,
    name: "NUR 310 Medical-surgical nursing",
    joinedAt: "2026-09-01T15:00:00Z",
    timeZone: "America/Denver",
    workspaceName: "LeaRN",
    workspaceNumber: 1,
  },
  {
    id: CLASS_B,
    name: "NUR 320 Pharmacology",
    joinedAt: "2026-09-02T15:00:00Z",
    timeZone: "America/Denver",
    workspaceName: "LeaRN",
    workspaceNumber: 1,
  },
];

/** The same student in a second teacher's workspace too: now every class says which. */
export const HOME_FIXTURE_CLASSES_TWO_WORKSPACES: readonly StudentClass[] = [
  HOME_FIXTURE_CLASSES[0]!,
  {
    id: CLASS_B,
    name: "NUR 320 Pharmacology",
    joinedAt: "2026-09-02T15:00:00Z",
    timeZone: "America/New_York",
    workspaceName: "Riverside College of Nursing",
    workspaceNumber: 2,
  },
];

export const HOME_FIXTURE_ASSIGNMENTS: readonly AssignmentSummary[] = [
  {
    id: "00000000-0000-4000-8000-0000005630a1",
    classId: CLASS_A,
    title: "Week 9: Respiratory case study",
    opensAt: "2026-11-10T15:00:00Z",
    closesAt: "2026-11-21T00:00:00Z",
    maxAttempts: 2,
    shuffleOptions: true,
  },
  {
    id: "00000000-0000-4000-8000-0000005630a2",
    classId: CLASS_B,
    title: "Anticoagulants check-in",
    opensAt: "2026-11-12T15:00:00Z",
    closesAt: "2026-11-24T00:00:00Z",
    maxAttempts: 1,
    shuffleOptions: false,
  },
];

/** The first assignment is under way. */
export const HOME_FIXTURE_PROGRESS: ReadonlyMap<string, AttemptProgress> = new Map([
  ["00000000-0000-4000-8000-0000005630a1", { submitted: 0, open: true }],
]);

export const HOME_FIXTURE_PRACTICE: readonly PracticeBank[] = [
  {
    bankId: "00000000-0000-4000-8000-0000005630b1",
    name: "Fluids and electrolytes",
    itemCount: 12,
    answered: 0,
    workspaceName: "LeaRN",
  },
];

export const HOME_FIXTURE_HISTORY: readonly HistoryRow[] = [
  {
    id: "00000000-0000-4000-8000-0000005630d1",
    classId: CLASS_A,
    title: "Week 8: Cardiac assessment",
    closesAt: "2026-11-07T00:00:00Z",
    maxAttempts: 2,
    attemptsUsed: 1,
    standing: {
      kind: "scored",
      best: { attemptNumber: 1, score: 14, maxScore: 18, percent: (14 / 18) * 100 },
    },
  },
];

export const HOME_FIXTURE_LIVE: readonly LiveHistoryRow[] = [
  {
    id: "00000000-0000-4000-8000-0000005630e1",
    title: "Monday warm-up",
    classId: CLASS_A,
    className: "NUR 310 Medical-surgical nursing",
    closedAt: "2026-11-09T16:30:00Z",
    points: 4,
    possible: 5,
    percent: 80,
    answered: 5,
    questionCount: 5,
  },
];

const mark = (cjmmStep: number, points: number): StepMark => ({
  source: "assignments",
  cjmmStep,
  points,
  maxPoints: 1,
});

export const HOME_FIXTURE_STEPS: StepStandings = buildStepStandings([
  ...[1, 1, 1, 0, 1].map((points) => mark(1, points)),
  ...[1, 0, 0, 1, 0].map((points) => mark(2, points)),
  mark(4, 1),
  mark(4, 0),
]);

/** No answer anywhere yet. */
export const HOME_FIXTURE_NO_STEPS: StepStandings = buildStepStandings([]);
