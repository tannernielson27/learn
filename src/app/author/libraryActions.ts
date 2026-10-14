"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BankFormState } from "@/components/authoring/CreateBankForm";
import type { FolderFormState } from "@/components/authoring/FolderNameForm";
import { parseBankForm } from "@/lib/authoring/bankForm";
import { parseFolderName } from "@/lib/authoring/folders";
import { isUuid } from "@/lib/authoring/ids";
import {
  createLibraryFolder,
  createQuizInFolder,
  deleteLibraryFolder,
  moveQuizzes,
  renameLibraryFolder,
} from "@/lib/authoring/libraryData";
import { parseQuizMoveForm } from "@/lib/authoring/libraryFolders";
import { requireAuthor } from "@/lib/authoring/session";
import { LIBRARY_PATH } from "@/lib/authoring/teacherNav";

// Library folders (#411): folders that hold quizzes. Every write runs under the caller's RLS, so a
// folder or quiz in another workspace matches nothing.

const FOLDER_GONE: FolderFormState = { status: "error", error: "That folder no longer exists." };

const folderPath = (folderId: string | null) =>
  folderId ? `${LIBRARY_PATH}?folder=${folderId}` : LIBRARY_PATH;

/** Creates a folder at the top of the library, or inside `parentId`. */
export async function createLibraryFolderAction(
  parentId: string | null,
  _previous: FolderFormState,
  formData: FormData,
): Promise<FolderFormState> {
  if (parentId !== null && !isUuid(parentId)) return FOLDER_GONE;
  const parsed = parseFolderName(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase, orgId } = await requireAuthor(folderPath(parentId));
  const created = await createLibraryFolder(supabase, { orgId, parentId, name: parsed.name });
  if (!created.ok) return { status: "error", error: created.error };

  revalidatePath(LIBRARY_PATH);
  return { status: "done", message: `Created "${parsed.name}".` };
}

export async function renameLibraryFolderAction(
  folderId: string,
  _previous: FolderFormState,
  formData: FormData,
): Promise<FolderFormState> {
  if (!isUuid(folderId)) return FOLDER_GONE;
  const parsed = parseFolderName(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase } = await requireAuthor(folderPath(folderId));
  const renamed = await renameLibraryFolder(supabase, folderId, parsed.name);
  if (!renamed.ok) return { status: "error", error: renamed.error };

  revalidatePath(LIBRARY_PATH);
  return { status: "done", message: `Renamed to "${parsed.name}".` };
}

/** Deletes an empty folder, then opens its parent (or the library). */
export async function deleteLibraryFolderAction(folderId: string): Promise<FolderFormState> {
  if (!isUuid(folderId)) return FOLDER_GONE;

  const { supabase } = await requireAuthor(folderPath(folderId));
  const deleted = await deleteLibraryFolder(supabase, folderId);
  if (!deleted.ok) return { status: "error", error: deleted.error };

  revalidatePath(LIBRARY_PATH);
  redirect(folderPath(deleted.value.parentId));
}

/** Moves the selected quizzes into a folder, or out of every folder. */
export async function moveQuizzesAction(
  _previous: FolderFormState,
  formData: FormData,
): Promise<FolderFormState> {
  const parsed = parseQuizMoveForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase } = await requireAuthor(LIBRARY_PATH);
  const moved = await moveQuizzes(supabase, parsed);
  if (!moved.ok) return { status: "error", error: moved.error };

  revalidatePath(LIBRARY_PATH);
  return { status: "done", message: moved.value.message };
}

/** Creates a quiz inside the open folder and opens it. */
export async function createQuizInFolderAction(
  folderId: string,
  _previous: BankFormState,
  formData: FormData,
): Promise<BankFormState> {
  if (!isUuid(folderId)) return { status: "error", error: "That folder no longer exists." };
  const parsed = parseBankForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase, orgId, userId } = await requireAuthor(folderPath(folderId));
  const created = await createQuizInFolder(supabase, {
    name: parsed.name,
    orgId,
    userId,
    folderId,
  });
  if (!created.ok) return { status: "error", error: created.error };

  revalidatePath(LIBRARY_PATH);
  redirect(`/author/banks/${created.value.id}`);
}
