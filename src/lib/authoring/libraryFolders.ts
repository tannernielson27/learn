import { countLabel, NOT_IN_A_FOLDER, UNFILED, type FolderRow } from "./folders";
import { isUuid } from "./ids";
import { LIBRARY_PATH } from "./teacherNav";

/**
 * Library folders (#411): folders that hold quizzes, one tree per workspace. Kept in line with the
 * library_folders constraints (20261014000000_library_folders.sql).
 */
export const LIBRARY_FOLDER_MAX_DEPTH = 2;
/** A workspace's folders are read whole, so the tree is never cut off mid-branch below this. */
export const LIBRARY_FOLDER_LIST_LIMIT = 500;
/** How many quizzes one move may carry; the library lists at most this many in a view. */
export const QUIZ_MOVE_LIMIT = 100;

export interface LibraryFolderRow extends FolderRow {
  /** How many quizzes are in this folder itself, not in the folders inside it. */
  quizCount: number;
}

/**
 * What the library lists: its top level (the folders and the quizzes in none, "Not in a folder"
 * in the rail), every quiz wherever it is filed ("All quizzes"), or one folder.
 */
export type LibraryView = { kind: "top" } | { kind: "all" } | { kind: "folder"; id: string };

/** The `folder` search parameter's value for All quizzes. */
export const ALL_QUIZZES = "all";

export type QuizMoveResult =
  { ok: true; folderId: string | null; quizIds: string[] } | { ok: false; error: string };

/** Said when the database has no library folders yet (the migration is not pushed). */
export const FOLDERS_NOT_READY = "Folders are not ready yet. Try again later.";

/** Reads the library's `folder` search parameter. Anything unreadable shows the top level. */
export function parseLibraryView(value: string | string[] | undefined): LibraryView {
  if (value === ALL_QUIZZES) return { kind: "all" };
  return typeof value === "string" && isUuid(value)
    ? { kind: "folder", id: value }
    : { kind: "top" };
}

/** Where a library view lives. */
export function libraryViewHref(view: LibraryView): string {
  if (view.kind === "top") return LIBRARY_PATH;
  return `${LIBRARY_PATH}?folder=${view.kind === "all" ? ALL_QUIZZES : view.id}`;
}

/** One line of the library's folder rail (Library mockup), or one chip of it on a phone. */
export interface LibraryRailEntry {
  /** "all", "top" or the folder's id. */
  key: string;
  label: string;
  href: string;
  /** 1 for a folder inside a top-level one, drawn indented on the rail. */
  depth: number;
  /** The view the page shows: the link carries `aria-current`. */
  current: boolean;
  /** A folder's own quizzes; the two views carry none, since neither count is read. */
  quizCount?: number;
}

/**
 * The rail: All quizzes, Not in a folder (the top level), then the top level's folders, with the
 * branch of the open folder opened so its own folders are listed under it.
 */
export function libraryRail(
  rows: readonly LibraryFolderRow[],
  view: LibraryView,
): LibraryRailEntry[] {
  const openId = view.kind === "folder" ? view.id : null;
  const open = openId ? rows.find((row) => row.id === openId) : undefined;
  // The top-level folder whose branch is open: the open folder, or the one it sits in.
  const branch = open ? (open.parentId ?? open.id) : null;
  const folderEntry = (row: LibraryFolderRow, depth: number): LibraryRailEntry => ({
    key: row.id,
    label: row.name,
    href: libraryViewHref({ kind: "folder", id: row.id }),
    depth,
    current: row.id === openId,
    quizCount: row.quizCount,
  });
  const entries: LibraryRailEntry[] = [
    {
      key: ALL_QUIZZES,
      label: "All quizzes",
      href: libraryViewHref({ kind: "all" }),
      depth: 0,
      current: view.kind === "all",
    },
    {
      key: "top",
      label: NOT_IN_A_FOLDER,
      href: LIBRARY_PATH,
      depth: 0,
      current: view.kind === "top",
    },
  ];
  for (const row of childFolders(rows, null)) {
    entries.push(folderEntry(row, 0));
    if (row.id === branch) {
      for (const child of childFolders(rows, row.id)) entries.push(folderEntry(child, 1));
    }
  }
  return entries;
}

/** The folders directly inside `parentId` (null for the top level). */
export function childFolders(
  rows: readonly LibraryFolderRow[],
  parentId: string | null,
): LibraryFolderRow[] {
  return rows.filter((row) => row.parentId === parentId);
}

/** Reads a move: the destination (`folder`, or "unfiled") and the selected `quiz` ids. */
export function parseQuizMoveForm(formData: FormData): QuizMoveResult {
  const folder = formData.get("folder");
  let folderId: string | null;
  if (folder === UNFILED) folderId = null;
  else if (typeof folder === "string" && isUuid(folder)) folderId = folder;
  else return { ok: false, error: "Choose a folder." };

  const raw = formData.getAll("quiz");
  // Bounded before any id is read, so a flood of fields costs no more than counting them.
  if (raw.length > QUIZ_MOVE_LIMIT) {
    return { ok: false, error: `Move at most ${QUIZ_MOVE_LIMIT} quizzes at a time.` };
  }
  if (!raw.every((value): value is string => typeof value === "string" && isUuid(value))) {
    return { ok: false, error: "That selection could not be read. Reload the page and try again." };
  }
  const quizIds = [...new Set(raw)];
  if (quizIds.length === 0) return { ok: false, error: "Select a quiz to move." };
  return { ok: true, folderId, quizIds };
}

/** Why a folder cannot be deleted, naming what is inside; null when it is empty. */
export function libraryFolderContentsMessage(
  name: string,
  contents: { quizzes: number; folders: number },
): string | null {
  const parts = [
    countLabel(contents.quizzes, "quiz", "quizzes"),
    countLabel(contents.folders, "folder", "folders"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const total = contents.quizzes + contents.folders;
  const first =
    contents.folders === 0
      ? `Move ${total === 1 ? "it" : "them"} out first.`
      : contents.quizzes === 0
        ? `Delete ${total === 1 ? "it" : "them"} first.`
        : "Empty it first.";
  return `"${name}" holds ${parts.join(" and ")}. ${first}`;
}

/** What a move did. `destination` is a folder path or "Not in a folder". */
export function quizMoveSummary(moved: number, destination: string): string {
  if (moved <= 0) return "Nothing was moved. Reload the page and try again.";
  return `Moved ${countLabel(moved, "quiz", "quizzes")} to ${destination}.`;
}

/** Where a move goes, as the interface names it. */
export function destinationName(rows: readonly FolderRow[], folderId: string | null): string {
  if (folderId === null) return NOT_IN_A_FOLDER;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const names: string[] = [];
  let current = byId.get(folderId);
  while (current && names.length < LIBRARY_FOLDER_MAX_DEPTH + 1) {
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join("/");
}

/**
 * A plain reason for a refused folder write, from its Postgres error code; null when the code has
 * no folder-specific meaning, so the caller uses its own message.
 */
export function libraryFolderWriteError(code: string | undefined, name: string): string | null {
  switch (code) {
    case "23505":
      return `There is already a folder named "${name}" here.`;
    // The name is checked before writing, so a check violation here is the depth limit.
    case "23514":
      return `Folders go at most ${LIBRARY_FOLDER_MAX_DEPTH} levels deep.`;
    case "23503":
      return "That folder has changed since this page loaded. Reload the page and try again.";
    default:
      return null;
  }
}

/**
 * Codes for a table, column or relationship the database does not have: Postgres's own, and
 * PostgREST's for its schema cache. The app can deploy before the migration is pushed (#411), and
 * then the library reads as having no folders rather than failing.
 */
const MISSING_SCHEMA_CODES: ReadonlySet<string> = new Set([
  "42P01",
  "42703",
  "PGRST200",
  "PGRST204",
  "PGRST205",
]);

export function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  return typeof error?.code === "string" && MISSING_SCHEMA_CODES.has(error.code);
}
