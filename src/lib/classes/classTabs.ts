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
 * To add a tab (Live sessions and Progress are next): add its id here and its label below, then
 * give it a panel in `ClassPageView`, whose panels are keyed by `ClassTab` so the type checker
 * asks for one. Nothing else changes: the links, the parser and the address follow this list.
 */
export const CLASS_TABS = ["overview", "students", "assignments", "settings"] as const;
export type ClassTab = (typeof CLASS_TABS)[number];

export const DEFAULT_CLASS_TAB: ClassTab = "overview";

export const CLASS_TAB_LABELS: Readonly<Record<ClassTab, string>> = {
  overview: "Overview",
  students: "Students",
  assignments: "Assignments",
  settings: "Settings",
};

/** Anything that is not a known tab (a typo, an old bookmark, a repeated parameter) is the overview. */
export function parseClassTab(value: unknown): ClassTab {
  return CLASS_TABS.find((tab) => tab === value) ?? DEFAULT_CLASS_TAB;
}

export function classTabPath(classId: string, tab: ClassTab = DEFAULT_CLASS_TAB): string {
  const base = classPath(classId);
  return tab === DEFAULT_CLASS_TAB ? base : `${base}?tab=${tab}`;
}
