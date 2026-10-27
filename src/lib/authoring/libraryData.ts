import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { AuthoringDataError, BANK_LIST_LIMIT, listBanks, type BankSummary } from "./banks";
import { folderTrail, type FolderRow } from "./folders";
import {
  destinationName,
  FOLDERS_NOT_READY,
  isMissingSchemaError,
  LIBRARY_FOLDER_LIST_LIMIT,
  LIBRARY_FOLDER_MAX_DEPTH,
  libraryFolderContentsMessage,
  libraryFolderWriteError,
  quizMoveSummary,
  type LibraryFolderRow,
  type LibraryView,
} from "./libraryFolders";

type Client = SupabaseClient<Database>;

export type LibraryWrite<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The library as the page draws it. `ready` is false on a database without library folders yet
 * (#411's migration not pushed): the quizzes are listed as before, and there are no folders.
 */
export interface Library {
  ready: boolean;
  /** Every folder in the workspace, for the tree, the breadcrumbs and the move choices. */
  folders: LibraryFolderRow[];
  /** The quizzes in the open view: the top level's are those in no folder. */
  quizzes: LibraryQuiz[];
}

/** A quiz as the library lists it, with the folder it is filed in (null for none). */
export interface LibraryQuiz extends BankSummary {
  folderId: string | null;
}

const GONE = "That folder no longer exists. Reload the page and try again.";
const FAILED = {
  create: "The folder could not be created. Try again.",
  rename: "The folder could not be renamed. Try again.",
  delete: "The folder could not be deleted. Try again.",
  move: "The quizzes could not be moved. Try again.",
} as const;

const fail = <T>(error: string): LibraryWrite<T> => ({ ok: false, error });

/** A count from an embedded `(count)` read; anything else reads as none. */
function embeddedCount(value: unknown): number {
  const first = Array.isArray(value) ? (value[0] as { count?: unknown } | undefined) : undefined;
  return typeof first?.count === "number" ? first.count : 0;
}

/** Every folder in the caller's workspace, under RLS, each with how many quizzes it holds. */
async function readFolders(client: Client) {
  return client
    .from("library_folders")
    .select("id, parent_id, name, item_banks!item_banks_library_folder_fkey(count)")
    .order("name")
    .limit(LIBRARY_FOLDER_LIST_LIMIT);
}

function folderRows(
  data: { id: string; parent_id: string | null; name: string; item_banks: unknown }[],
): LibraryFolderRow[] {
  return data.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    quizCount: embeddedCount(row.item_banks),
  }));
}

/**
 * The folders and the open view's quizzes, in one round trip. A database without library folders
 * answers with the quizzes as they were listed before #411, and no folders.
 */
export async function readLibrary(client: Client, view: LibraryView): Promise<Library> {
  const quizzes = client
    .from("item_banks")
    .select("id, name, updated_at, library_folder_id, items(count)")
    // Count what the quiz page lists: archived questions are left out there too.
    .neq("items.status", "archived");
  const filtered =
    view.kind === "folder"
      ? quizzes.eq("library_folder_id", view.id)
      : view.kind === "top"
        ? quizzes.is("library_folder_id", null)
        : quizzes;
  const [folders, banks] = await Promise.all([
    readFolders(client),
    filtered.order("updated_at", { ascending: false }).limit(BANK_LIST_LIMIT),
  ]);
  if (isMissingSchemaError(folders.error) || isMissingSchemaError(banks.error)) {
    const every = await listBanks(client);
    return {
      ready: false,
      folders: [],
      quizzes: every.map((quiz) => ({ ...quiz, folderId: null })),
    };
  }
  if (folders.error) throw new AuthoringDataError("Folders could not be loaded.");
  if (banks.error) throw new AuthoringDataError("Quizzes could not be loaded.");
  return {
    ready: true,
    folders: folderRows(folders.data),
    quizzes: banks.data.map((bank) => ({
      id: bank.id,
      name: bank.name,
      updatedAt: bank.updated_at,
      itemCount: embeddedCount(bank.items),
      folderId: bank.library_folder_id ?? null,
    })),
  };
}

/**
 * The library folders a quiz sits in, from the top down, for its breadcrumbs. Empty for a quiz in
 * no folder, and for anything that cannot be read: a breadcrumb is never worth failing a page.
 */
export async function quizLibraryTrail(client: Client, bankId: string): Promise<FolderRow[]> {
  const { data: bank, error } = await client
    .from("item_banks")
    .select("library_folder_id")
    .eq("id", bankId)
    .maybeSingle();
  if (error || !bank?.library_folder_id) return [];
  const folders = await readFolders(client);
  if (folders.error) return [];
  return folderTrail(folderRows(folders.data), bank.library_folder_id);
}

export interface NewLibraryFolder {
  orgId: string;
  /** The folder to create it in, or null for the top of the library. */
  parentId: string | null;
  name: string;
}

export async function createLibraryFolder(
  client: Client,
  folder: NewLibraryFolder,
): Promise<LibraryWrite<{ id: string }>> {
  if (folder.parentId) {
    // The database refuses a third level too; checking first gives the plain reason every time.
    const { data: parent, error } = await client
      .from("library_folders")
      .select("depth")
      .eq("id", folder.parentId)
      .maybeSingle();
    if (isMissingSchemaError(error)) return fail(FOLDERS_NOT_READY);
    if (error) return fail(FAILED.create);
    if (!parent) return fail(GONE);
    if (parent.depth >= LIBRARY_FOLDER_MAX_DEPTH) {
      return fail(libraryFolderWriteError("23514", folder.name)!);
    }
  }

  // The depth and the maker come from the database, never from here.
  const { data, error } = await client
    .from("library_folders")
    .insert({ org_id: folder.orgId, parent_id: folder.parentId, name: folder.name })
    .select("id")
    .single();
  if (isMissingSchemaError(error)) return fail(FOLDERS_NOT_READY);
  if (error) return fail(libraryFolderWriteError(error.code, folder.name) ?? FAILED.create);
  return { ok: true, value: { id: data.id } };
}

export async function renameLibraryFolder(
  client: Client,
  folderId: string,
  name: string,
): Promise<LibraryWrite<null>> {
  const { data, error } = await client
    .from("library_folders")
    .update({ name })
    .eq("id", folderId)
    .select("id");
  if (isMissingSchemaError(error)) return fail(FOLDERS_NOT_READY);
  if (error) return fail(libraryFolderWriteError(error.code, name) ?? FAILED.rename);
  if (data.length === 0) return fail(GONE);
  return { ok: true, value: null };
}

/**
 * Deletes an empty folder and returns its parent, so the caller can open it. A folder that still
 * holds quizzes or folders is refused with what is inside; the database's keys refuse it too, for
 * anything filed in between. Nothing is ever deleted with a folder.
 */
export async function deleteLibraryFolder(
  client: Client,
  folderId: string,
): Promise<LibraryWrite<{ parentId: string | null }>> {
  const { data: folder, error } = await client
    .from("library_folders")
    .select("id, name, parent_id")
    .eq("id", folderId)
    .maybeSingle();
  if (isMissingSchemaError(error)) return fail(FOLDERS_NOT_READY);
  if (error) return fail(FAILED.delete);
  if (!folder) return fail(GONE);

  const [quizzes, children] = await Promise.all([
    client
      .from("item_banks")
      .select("id", { count: "exact", head: true })
      .eq("library_folder_id", folderId),
    client
      .from("library_folders")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", folderId),
  ]);
  if (quizzes.error || children.error) return fail(FAILED.delete);
  const inside = libraryFolderContentsMessage(folder.name, {
    quizzes: quizzes.count ?? 0,
    folders: children.count ?? 0,
  });
  if (inside) return fail(inside);

  const { data: deleted, error: deleteError } = await client
    .from("library_folders")
    .delete()
    .eq("id", folderId)
    .select("id");
  if (deleteError) {
    return fail(libraryFolderWriteError(deleteError.code, folder.name) ?? FAILED.delete);
  }
  if (deleted.length === 0) return fail(GONE);
  return { ok: true, value: { parentId: folder.parent_id } };
}

export interface QuizMove {
  /** Null takes the quizzes out of every folder. */
  folderId: string | null;
  quizIds: string[];
}

/**
 * Files quizzes in a folder, or in none, in one statement, so either all of them move or none do.
 * Only library_folder_id is written: a quiz's questions, live sessions, assignments and practice
 * shares point at the quiz and are untouched. Ids from another workspace match no rows, and its
 * folders are refused by the key.
 */
export async function moveQuizzes(
  client: Client,
  move: QuizMove,
): Promise<LibraryWrite<{ message: string }>> {
  let destination: string;
  if (move.folderId) {
    const folders = await readFolders(client);
    if (isMissingSchemaError(folders.error)) return fail(FOLDERS_NOT_READY);
    if (folders.error) return fail(FAILED.move);
    const rows = folderRows(folders.data);
    if (!rows.some((row) => row.id === move.folderId)) return fail(GONE);
    destination = destinationName(rows, move.folderId);
  } else {
    destination = destinationName([], null);
  }

  const { data, error } = await client
    .from("item_banks")
    .update({ library_folder_id: move.folderId })
    .in("id", move.quizIds)
    .select("id");
  if (isMissingSchemaError(error)) return fail(FOLDERS_NOT_READY);
  // 23503: the folder went away between reading it and moving.
  if (error) return fail(error.code === "23503" ? GONE : FAILED.move);
  const message = quizMoveSummary(data.length, destination);
  return data.length === 0 ? fail(message) : { ok: true, value: { message } };
}

/** Creates a quiz inside a library folder. Returns its id. */
export async function createQuizInFolder(
  client: Client,
  quiz: { name: string; orgId: string; userId: string; folderId: string },
): Promise<LibraryWrite<{ id: string }>> {
  const { data, error } = await client
    .from("item_banks")
    .insert({
      name: quiz.name,
      org_id: quiz.orgId,
      created_by: quiz.userId,
      library_folder_id: quiz.folderId,
    })
    .select("id")
    .single();
  if (isMissingSchemaError(error)) return fail(FOLDERS_NOT_READY);
  if (error) {
    return fail(error.code === "23503" ? GONE : "The quiz could not be created. Try again.");
  }
  return { ok: true, value: { id: data.id } };
}
