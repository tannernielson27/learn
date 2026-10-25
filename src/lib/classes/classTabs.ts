import { classPath } from "./classes";

/**
 * The parts of a class page, one at a time. Pure: no React, no Next, no Supabase.
 *
 * The open one is kept in the address (`?tab=students`) rather than in component state, as the
 * reports keep their view (`parseReportView`): a teacher can bookmark or share the Students page,
 * Back and Forward walk between them, the browser's own links do the switching with no script, and
 * every Server Function that revalidates `classPath` still covers all of them, since they are one
 * route. The overview has no parameter, so every link to a class that predates the tabs still
 * lands on it.
 *
 * To add a tab: add its id here, its label and what it reads
 * below, then give it a panel in `ClassPageView`, whose panels are keyed by `ClassTab` so the type
 * checker asks for one. A read it needs that the page does not make yet goes in `ClassPageRead`
 * and the page's reads. Nothing else changes: the links, the parser and the address follow this
 * list.
 */
export const CLASS_TABS = [
  "overview",
  "students",
  "progress",
  "sessions",
  "assignments",
  "settings",
] as const;
export type ClassTab = (typeof CLASS_TABS)[number];

export const DEFAULT_CLASS_TAB: ClassTab = "overview";

export const CLASS_TAB_LABELS: Readonly<Record<ClassTab, string>> = {
  overview: "Overview",
  students: "Students",
  progress: "Progress",
  sessions: "Live sessions",
  assignments: "Assignments",
  settings: "Settings",
};

/** What the class page can read besides the class itself, each its own query. */
export type ClassPageRead = "roster" | "assignments" | "shares" | "banks" | "progress" | "sessions";

/** What the header reads on every tab: the roster, for how many students the class has. */
export const CLASS_HEADER_READS: readonly ClassPageRead[] = ["roster"];

/**
 * What each tab's panel reads, beyond the header's. Only the open tab is drawn, so a tab reads
 * only what it shows: the overview summarises the roster, the assignments and the shares; the
 * share form's choices (the banks) are on Assignments only; Settings works from the class alone.
 * Progress reads the class's progress (`class_progress`, which is the heaviest read here, so no
 * other tab makes it), and Live sessions the class's live sessions.
 */
export const CLASS_TAB_READS: Readonly<Record<ClassTab, readonly ClassPageRead[]>> = {
  overview: ["roster", "assignments", "shares"],
  students: ["roster"],
  progress: ["progress"],
  sessions: ["sessions"],
  assignments: ["assignments", "shares", "banks"],
  settings: [],
};

/** Everything the class page reads with this tab open: the header's reads and the tab's. */
export function classTabReads(tab: ClassTab): ReadonlySet<ClassPageRead> {
  return new Set([...CLASS_HEADER_READS, ...CLASS_TAB_READS[tab]]);
}

/** Anything that is not a known tab (a typo, an old bookmark, a repeated parameter) is the overview. */
export function parseClassTab(value: unknown): ClassTab {
  return CLASS_TABS.find((tab) => tab === value) ?? DEFAULT_CLASS_TAB;
}

export function classTabPath(classId: string, tab: ClassTab = DEFAULT_CLASS_TAB): string {
  const base = classPath(classId);
  return tab === DEFAULT_CLASS_TAB ? base : `${base}?tab=${tab}`;
}
