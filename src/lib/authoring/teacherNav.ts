import { CLASSES_PATH } from "@/lib/classes/classes";
import { SESSIONS_PATH } from "@/lib/live/reportFormat";
import { WORKSPACE_PATH } from "@/lib/workspace/workspace";

/** The teacher's home: folders and quizzes together (docs/glossary.md). */
export const LIBRARY_PATH = "/author";

export type TeacherNavId = "library" | "classes" | "sessions" | "workspace";

export interface TeacherNavItem {
  readonly id: TeacherNavId;
  readonly label: string;
  readonly href: string;
}

/** The four places a teacher works in, in the order they are tabbed through (#412). */
export const TEACHER_NAV: readonly TeacherNavItem[] = [
  { id: "library", label: "Library", href: LIBRARY_PATH },
  { id: "classes", label: "Classes", href: CLASSES_PATH },
  { id: "sessions", label: "Live sessions", href: SESSIONS_PATH },
  { id: "workspace", label: "Workspace", href: WORKSPACE_PATH },
];

/**
 * Path prefixes that belong to a destination without sitting under its own path: a quiz, a
 * question and a case study are opened from the library, and an assignment's report from a class.
 */
const SECTION_PREFIXES: Readonly<Record<TeacherNavId, readonly string[]>> = {
  library: ["/author/banks", "/author/items", "/author/case-studies"],
  classes: [CLASSES_PATH, "/author/assignments"],
  sessions: [SESSIONS_PATH],
  workspace: [WORKSPACE_PATH],
};

const under = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const withoutTrailingSlash = (pathname: string): string =>
  pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

/** Which destination a teacher page belongs to, or null for a page that belongs to none. */
export function teacherNavSection(pathname: string): TeacherNavId | null {
  const path = withoutTrailingSlash(pathname);
  if (path === LIBRARY_PATH) return "library";
  const found = TEACHER_NAV.find((item) =>
    SECTION_PREFIXES[item.id].some((prefix) => under(path, prefix)),
  );
  return found?.id ?? null;
}

/**
 * What `aria-current` says on a destination's link: "page" on the destination itself, "true" on a
 * page inside it (a quiz inside the library), and nothing anywhere else.
 */
export function teacherNavCurrent(
  item: TeacherNavItem,
  pathname: string,
): "page" | "true" | undefined {
  if (teacherNavSection(pathname) !== item.id) return undefined;
  return withoutTrailingSlash(pathname) === item.href ? "page" : "true";
}
