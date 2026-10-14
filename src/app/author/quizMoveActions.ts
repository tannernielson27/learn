"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import type { FolderFormState } from "@/components/authoring/FolderNameForm";
import { isUuid } from "@/lib/authoring/ids";
import { parseQuizMoveForm } from "@/lib/authoring/quizMove";
import { moveToQuiz, turnFolderIntoQuiz } from "@/lib/authoring/quizMoveData";
import { requireAuthor } from "@/lib/authoring/session";
import { LIBRARY_PATH } from "@/lib/authoring/teacherNav";

// #417: moving to another quiz, and turning an in-quiz folder into a quiz. Each is one database
// call under the caller's RLS, so another workspace's quiz, folder or content matches nothing.

const QUIZ_GONE = "That quiz no longer exists.";

/** Moves the selected questions and case studies to the chosen quiz. Bound to the quiz in hand. */
export async function moveToQuizAction(
  bankId: string,
  _previous: FolderFormState,
  formData: FormData,
): Promise<FolderFormState> {
  if (!isUuid(bankId)) return { status: "error", error: QUIZ_GONE };
  const parsed = parseQuizMoveForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase } = await requireAuthor(`/author/banks/${bankId}`);
  const moved = await moveToQuiz(supabase, bankId, parsed);
  if (!moved.ok) return { status: "error", error: moved.error };

  revalidatePath(`/author/banks/${bankId}`);
  revalidatePath(`/author/banks/${parsed.quizId}`);
  revalidatePath(LIBRARY_PATH);
  return { status: "done", message: moved.value.message };
}

/** Turns an in-quiz folder into a quiz, then opens it. Bound to the quiz and the folder. */
export async function turnFolderIntoQuizAction(
  bankId: string,
  folderId: string,
): Promise<ConfirmOutcome> {
  if (!isUuid(bankId) || !isUuid(folderId)) {
    return { ok: false, message: "That folder no longer exists." };
  }

  const { supabase } = await requireAuthor(`/author/banks/${bankId}?folder=${folderId}`);
  const turned = await turnFolderIntoQuiz(supabase, folderId);
  if (!turned.ok) return { ok: false, message: turned.error };

  revalidatePath(`/author/banks/${bankId}`);
  revalidatePath(LIBRARY_PATH);
  redirect(`/author/banks/${turned.value.quizId}`);
}
