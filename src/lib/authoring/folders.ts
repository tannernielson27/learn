import { isUuid } from "./ids";

/** Kept in line with the bank_folders constraints (#103). */
export const FOLDER_NAME_MAX = 80;
export const MAX_FOLDER_DEPTH = 4;
/** How many items and case studies one move may carry. */
export const MOVE_LIMIT = 200;
/** A bank's folders are read whole, so the tree is never cut off mid-branch below this. */
export const FOLDER_LIST_LIMIT = 500;

export interface FolderRow {
  id: string;
  parentId: string | null;
  name: string;
}

export interface FolderNode {
  id: string;
  name: string;
  /** Names from the top down, joined with "/", e.g. "Cardiac/Heart failure". */
  path: string;
  children: FolderNode[];
}

export interface FolderOption {
  id: string;
  path: string;
  depth: number;
}

/** What the bank page lists: everything, only unfiled content, or one folder's own content. */
export type FolderView = { kind: "all" } | { kind: "unfiled" } | { kind: "folder"; id: string };

export type FolderNameResult = { ok: true; name: string } | { ok: false; error: string };

export type MoveFormResult =
  | { ok: true; folderId: string | null; itemIds: string[]; caseStudyIds: string[] }
  | { ok: false; error: string };

export interface FolderContents {
  items: number;
  caseStudies: number;
  folders: number;
}

export const UNFILED = "unfiled";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Nests folders under their parents, each level sorted by name. A folder whose parent is not in
 * `rows` is left out, so the tree never shows a folder in the wrong place.
 */
export function buildFolderTree(rows: readonly FolderRow[]): FolderNode[] {
  const byParent = new Map<string | null, FolderRow[]>();
  for (const row of rows) {
    byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), row]);
  }
  const nodes = (parentId: string | null, prefix: string): FolderNode[] =>
    [...(byParent.get(parentId) ?? [])]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((row) => {
        const path = prefix ? `${prefix}/${row.name}` : row.name;
        return { id: row.id, name: row.name, path, children: nodes(row.id, path) };
      });
  return nodes(null, "");
}

/** A folder's ancestors from the top down, ending with the folder; empty for an unknown id. */
export function folderTrail(rows: readonly FolderRow[], id: string): FolderRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const trail: FolderRow[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return trail;
}

/** Every folder by path, in tree order, for choosing where to move content. */
export function folderOptions(rows: readonly FolderRow[]): FolderOption[] {
  const flatten = (nodes: FolderNode[], depth: number): FolderOption[] =>
    nodes.flatMap((node) => [
      { id: node.id, path: node.path, depth },
      ...flatten(node.children, depth + 1),
    ]);
  return flatten(buildFolderTree(rows), 1);
}

/** Reads the bank page's `folder` search parameter. Anything unreadable shows everything. */
export function parseFolderView(value: string | string[] | undefined): FolderView {
  if (value === UNFILED) return { kind: "unfiled" };
  if (typeof value === "string" && isUuid(value)) return { kind: "folder", id: value };
  return { kind: "all" };
}

export function parseFolderName(formData: FormData): FolderNameResult {
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, error: "Name the folder." };
  if (name.includes("/")) return { ok: false, error: "A folder name cannot contain a slash (/)." };
  if (name.length > FOLDER_NAME_MAX) {
    return {
      ok: false,
      error: `Keep the folder name to ${FOLDER_NAME_MAX} characters or fewer.`,
    };
  }
  return { ok: true, name };
}

/** Reads a move: the destination (`folder`, or "unfiled") and the selected `item` and `caseStudy` ids. */
export function parseMoveForm(formData: FormData): MoveFormResult {
  const folder = formData.get("folder");
  let folderId: string | null;
  if (folder === UNFILED) folderId = null;
  else if (typeof folder === "string" && isUuid(folder)) folderId = folder;
  else return { ok: false, error: "Choose a folder to move to." };

  const rawItems = formData.getAll("item");
  const rawCaseStudies = formData.getAll("caseStudy");
  // Bounded before any id is read, so a flood of fields costs no more than counting them.
  if (rawItems.length + rawCaseStudies.length > MOVE_LIMIT) {
    return { ok: false, error: `Move at most ${MOVE_LIMIT} at a time.` };
  }
  const itemIds = readIds(rawItems);
  const caseStudyIds = readIds(rawCaseStudies);
  if (!itemIds || !caseStudyIds) {
    return { ok: false, error: "That selection could not be read. Reload the page and try again." };
  }
  if (itemIds.length + caseStudyIds.length === 0) {
    return { ok: false, error: "Select at least one item or case study to move." };
  }
  return { ok: true, folderId, itemIds, caseStudyIds };
}

function readIds(values: FormDataEntryValue[]): string[] | null {
  if (!values.every((value): value is string => typeof value === "string" && isUuid(value))) {
    return null;
  }
  return [...new Set(values)];
}

/** Why a folder cannot be deleted, naming what is inside; null when it is empty. */
export function folderContentsMessage(name: string, contents: FolderContents): string | null {
  const parts = [
    countLabel(contents.items, "item", "items"),
    countLabel(contents.caseStudies, "case study", "case studies"),
    countLabel(contents.folders, "folder", "folders"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const total = contents.items + contents.caseStudies + contents.folders;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `"${name}" holds ${list}. Move or delete ${total === 1 ? "it" : "them"} first.`;
}

/** What a move did, or that nothing moved. `destination` is a folder path or "Unfiled". */
export function moveSummary(
  moved: { items: number; caseStudies: number },
  destination: string,
): string {
  const parts = [
    countLabel(moved.items, "item", "items"),
    countLabel(moved.caseStudies, "case study", "case studies"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return "Nothing was moved. Reload the page and try again.";
  return `Moved ${parts.join(" and ")} to ${destination}.`;
}

/**
 * A plain reason for a refused folder write, from its Postgres error code; null when the code has
 * no folder-specific meaning, so the caller uses its own message.
 */
export function folderWriteError(code: string | undefined, name: string): string | null {
  switch (code) {
    case "23505":
      return `There is already a folder named "${name}" here.`;
    // The name is checked before writing, so a check violation here is the depth limit.
    case "23514":
      return `Folders go at most ${MAX_FOLDER_DEPTH} levels deep.`;
    case "23503":
      return "That folder has changed since this page loaded. Reload the page and try again.";
    default:
      return null;
  }
}

export function countLabel(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}
