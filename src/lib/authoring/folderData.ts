import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { AuthoringDataError } from "./banks";
import { isRateLimitedError, RATE_LIMIT_ERRORS } from "./rateLimit";
import {
  FOLDER_LIST_LIMIT,
  folderContentsMessage,
  folderTrail,
  folderWriteError,
  MAX_FOLDER_DEPTH,
  moveSummary,
  type FolderRow,
} from "./folders";

type Client = SupabaseClient<Database>;

export type FolderWrite<T> = { ok: true; value: T } | { ok: false; error: string };

const GONE = "That folder no longer exists. Reload the page and try again.";
const FAILED = {
  create: "The folder could not be created. Try again.",
  rename: "The folder could not be renamed. Try again.",
  delete: "The folder could not be deleted. Try again.",
  move: "The selection could not be moved. Try again.",
} as const;

const fail = <T>(error: string): FolderWrite<T> => ({ ok: false, error });

/** A bank's folders, under the caller's RLS. */
export async function listFolders(client: Client, bankId: string): Promise<FolderRow[]> {
  const { data, error } = await client
    .from("bank_folders")
    .select("id, parent_id, name")
    .eq("bank_id", bankId)
    .order("name")
    .limit(FOLDER_LIST_LIMIT);
  if (error) throw new AuthoringDataError("Folders could not be loaded.");
  return data.map((row) => ({ id: row.id, parentId: row.parent_id, name: row.name }));
}

export interface NewFolder {
  bankId: string;
  orgId: string;
  userId: string;
  /** The folder to create it in, or null for the top level. */
  parentId: string | null;
  name: string;
}

export async function createFolder(
  client: Client,
  folder: NewFolder,
): Promise<FolderWrite<{ id: string }>> {
  if (folder.parentId) {
    // The database refuses a fifth level too; checking first gives the plain reason every time.
    const { data: parent, error } = await client
      .from("bank_folders")
      .select("depth")
      .eq("id", folder.parentId)
      .eq("bank_id", folder.bankId)
      .maybeSingle();
    if (error) return fail(FAILED.create);
    if (!parent) return fail(GONE);
    if (parent.depth >= MAX_FOLDER_DEPTH) return fail(folderWriteError("23514", folder.name)!);
  }

  const { data, error } = await client
    .from("bank_folders")
    .insert({
      bank_id: folder.bankId,
      org_id: folder.orgId,
      parent_id: folder.parentId,
      name: folder.name,
      created_by: folder.userId,
    })
    .select("id")
    .single();
  if (error) return fail(folderWriteError(error.code, folder.name) ?? FAILED.create);
  return { ok: true, value: { id: data.id } };
}

export async function renameFolder(
  client: Client,
  bankId: string,
  folderId: string,
  name: string,
): Promise<FolderWrite<null>> {
  const { data, error } = await client
    .from("bank_folders")
    .update({ name })
    .eq("id", folderId)
    .eq("bank_id", bankId)
    .select("id");
  if (error) return fail(folderWriteError(error.code, name) ?? FAILED.rename);
  if (data.length === 0) return fail(GONE);
  return { ok: true, value: null };
}

/**
 * Deletes an empty folder and returns its parent, so the caller can open it. A folder that still
 * holds items, case studies or folders is refused with what is inside; the database's keys refuse
 * it too, for anything added in between.
 */
export async function deleteFolder(
  client: Client,
  bankId: string,
  folderId: string,
): Promise<FolderWrite<{ parentId: string | null }>> {
  const { data: folder, error } = await client
    .from("bank_folders")
    .select("id, name, parent_id")
    .eq("id", folderId)
    .eq("bank_id", bankId)
    .maybeSingle();
  if (error) return fail(FAILED.delete);
  if (!folder) return fail(GONE);

  const [items, caseStudies, children] = await Promise.all([
    client.from("items").select("id", { count: "exact", head: true }).eq("folder_id", folderId),
    client
      .from("case_studies")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", folderId),
    client
      .from("bank_folders")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", folderId),
  ]);
  if (items.error || caseStudies.error || children.error) return fail(FAILED.delete);
  const inside = folderContentsMessage(folder.name, {
    items: items.count ?? 0,
    caseStudies: caseStudies.count ?? 0,
    folders: children.count ?? 0,
  });
  if (inside) return fail(inside);

  const { data: deleted, error: deleteError } = await client
    .from("bank_folders")
    .delete()
    .eq("id", folderId)
    .eq("bank_id", bankId)
    .select("id");
  if (deleteError) return fail(folderWriteError(deleteError.code, folder.name) ?? FAILED.delete);
  if (deleted.length === 0) return fail(GONE);
  return { ok: true, value: { parentId: folder.parent_id } };
}

export interface FolderMove {
  /** Null moves to Unfiled. */
  folderId: string | null;
  itemIds: string[];
  caseStudyIds: string[];
}

/**
 * Files items and case studies in a folder of their own bank, in one database call, so either all
 * of them move or none do. Only folder_id is written, so content, status and version never change.
 * Ids from another bank or org match no rows.
 */
export async function moveToFolder(
  client: Client,
  bankId: string,
  move: FolderMove,
): Promise<FolderWrite<{ message: string }>> {
  // The destination's path names it in the summary; an unknown folder is refused before moving.
  let destination = "Unfiled";
  if (move.folderId) {
    let folders: FolderRow[];
    try {
      folders = await listFolders(client, bankId);
    } catch {
      return fail(FAILED.move);
    }
    const trail = folderTrail(folders, move.folderId);
    if (trail.length === 0) return fail(GONE);
    destination = trail.map((row) => row.name).join("/");
  }

  const { data, error } = await client.rpc("move_to_folder", {
    target_bank: bankId,
    item_ids: move.itemIds,
    case_study_ids: move.caseStudyIds,
    ...(move.folderId ? { target_folder: move.folderId } : {}),
  });
  // 54000: moving writes to `items` and `case_studies`, so since #123 it spends a `save` and can
  // be refused for being over the limit. Say so, rather than blaming the move.
  if (isRateLimitedError(error)) return fail(RATE_LIMIT_ERRORS.limited);
  // 22023: the folder went away between reading it and moving.
  if (error) return fail(error.code === "22023" ? GONE : FAILED.move);

  const moved = readMoved(data);
  const message = moveSummary(moved, destination);
  return moved.items + moved.caseStudies === 0 ? fail(message) : { ok: true, value: { message } };
}

/** The function's `{ items, case_studies }` counts; anything else reads as nothing moved. */
function readMoved(data: unknown): { items: number; caseStudies: number } {
  const counts = (data ?? {}) as { items?: unknown; case_studies?: unknown };
  const count = (value: unknown) => (typeof value === "number" && value > 0 ? value : 0);
  return { items: count(counts.items), caseStudies: count(counts.case_studies) };
}
