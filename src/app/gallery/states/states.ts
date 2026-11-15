/**
 * Every distinct loading, error and not-found screen a route draws (#563), one per `?state=` of
 * `/gallery/states`. `frame` is what surrounds it on the real route: the teacher's or the student's
 * `AppShell`, or nothing (a page that brings its own frame: the account form's, the status frame,
 * the live console's or the student room's).
 */
export const STATE_IDS = [
  "loading-account",
  "loading-classes",
  "loading-sessions",
  "loading-workspace",
  "loading-student-home",
  "error-author",
  "error-case-study",
  "error-play-item",
  "error-live",
  "error-report",
  "error-room",
  "error-learn",
  "error-root",
  "error-global",
  "not-found-root",
  "not-found-author",
  "not-found-learn",
] as const;

export type StateId = (typeof STATE_IDS)[number];

/** The states that draw a route's error view, which takes `retry` and so renders on the client. */
export type ErrorStateId = Extract<StateId, `error-${string}`>;

export function isErrorState(id: StateId): id is ErrorStateId {
  return id.startsWith("error-");
}

export type StateFrame = "teacher" | "student" | "own";

export interface StateEntry {
  /** What the gallery's caption says, and the route file it draws. */
  label: string;
  file: string;
  frame: StateFrame;
}

export const STATES: Record<StateId, StateEntry> = {
  "loading-account": {
    label: "Loading: account",
    file: "src/app/account/loading.tsx",
    frame: "own",
  },
  "loading-classes": {
    label: "Loading: classes",
    file: "src/app/author/classes/(list)/loading.tsx",
    frame: "teacher",
  },
  "loading-sessions": {
    label: "Loading: live sessions",
    file: "src/app/author/sessions/loading.tsx",
    frame: "teacher",
  },
  "loading-workspace": {
    label: "Loading: workspace",
    file: "src/app/author/workspace/loading.tsx",
    frame: "teacher",
  },
  "loading-student-home": {
    label: "Loading: student home",
    file: "src/app/learn/(home)/loading.tsx",
    frame: "student",
  },
  "error-author": {
    label: "Error: teacher page",
    file: "src/app/author/error.tsx",
    frame: "teacher",
  },
  "error-case-study": {
    label: "Error: case study builder",
    file: "src/app/author/case-studies/[caseStudyId]/error.tsx",
    frame: "teacher",
  },
  "error-play-item": {
    label: "Error: playing a question",
    file: "src/app/author/items/[itemId]/play/error.tsx",
    frame: "teacher",
  },
  "error-live": {
    label: "Error: live session console",
    file: "src/app/live/[sessionId]/error.tsx",
    frame: "own",
  },
  "error-report": {
    label: "Error: live session report",
    file: "src/app/live/[sessionId]/report/error.tsx",
    frame: "own",
  },
  "error-room": {
    label: "Error: student in a live session",
    file: "src/app/play/[sessionId]/error.tsx",
    frame: "own",
  },
  "error-learn": {
    label: "Error: student page",
    file: "src/app/learn/error.tsx",
    frame: "student",
  },
  "error-root": { label: "Error: any other page", file: "src/app/error.tsx", frame: "own" },
  "error-global": { label: "Error: the whole app", file: "src/app/global-error.tsx", frame: "own" },
  "not-found-root": { label: "Not found", file: "src/app/not-found.tsx", frame: "own" },
  "not-found-author": {
    label: "Not found: teacher page",
    file: "src/app/author/not-found.tsx",
    frame: "teacher",
  },
  "not-found-learn": {
    label: "Not found: student page",
    file: "src/app/learn/not-found.tsx",
    frame: "student",
  },
};

/** The state a `?state=` names, or the first one. */
export function parseStateId(value: string | string[] | undefined): StateId {
  return STATE_IDS.find((id) => id === value) ?? STATE_IDS[0];
}
