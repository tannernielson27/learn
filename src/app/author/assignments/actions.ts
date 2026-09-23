"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AssignmentFormState } from "@/components/assignments/AssignmentForm";
import {
  assignmentPath,
  parseAssignmentEdit,
  parseAssignmentForm,
  parseCloseTime,
  type AssignmentSource,
} from "@/lib/assignments/assignments";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { classPath } from "@/lib/classes/classes";
import {
  createAssignment,
  deleteAssignment as removeAssignment,
  updateAssignmentCloseTime,
  updateAssignmentWindow,
  type AssignmentWriteFailure,
} from "@/lib/supabase/assignments";

const GONE = "That assignment no longer exists. Reload the page.";

const SHARED_REFUSALS: Readonly<Record<"rate_limited" | "failed", string>> = {
  rate_limited: "That is too many changes in a minute. Wait a moment and try again.",
  failed: "The assignment could not be saved. Try again.",
};

function createRefusal(source: AssignmentSource, reason: AssignmentWriteFailure): string {
  switch (reason) {
    case "unavailable":
      return source.kind === "bank"
        ? "Publish an item in this bank before assigning it."
        : "Publish the case study and every step before assigning it.";
    case "gone":
      return "That class or source no longer exists. Reload the page.";
    case "invalid":
      return "Check the times and the attempts, then try again.";
    default:
      return SHARED_REFUSALS[reason];
  }
}

function editRefusal(reason: AssignmentWriteFailure, closeOnly: boolean): string {
  switch (reason) {
    case "unavailable":
      return closeOnly
        ? "The close time has already passed."
        : "It has opened, so only its close time can change now. Reload the page.";
    case "gone":
      return GONE;
    case "invalid":
      return "The close time must be after the open time.";
    default:
      return SHARED_REFUSALS[reason];
  }
}

/** Assigns a bank or a case study to a class, then opens the class, where it is listed. */
export async function assignSource(
  source: AssignmentSource,
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const { supabase } = await requireAuthor(assignmentPath(source));
  if (!isUuid(source.id)) return { status: "error", error: createRefusal(source, "gone") };
  const parsed = parseAssignmentForm(formData, new Date());
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const written = await createAssignment(supabase, source, parsed.value);
  if (!written.ok) return { status: "error", error: createRefusal(source, written.reason) };

  revalidatePath(classPath(parsed.value.classId));
  redirect(classPath(parsed.value.classId));
}

/**
 * Edits one assignment. Before it opens: the window, the attempts and shuffling. After: only the
 * close time. The database enforces the same rule; `closeOnly` just picks which form was sent.
 */
export async function editAssignment(
  classId: string,
  assignmentId: string,
  closeOnly: boolean,
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const { supabase } = await requireAuthor(classPath(classId));
  if (!isUuid(classId) || !isUuid(assignmentId)) return { status: "error", error: GONE };

  const now = new Date();
  let written;
  if (closeOnly) {
    const parsed = parseCloseTime(formData, now);
    if (!parsed.ok) return { status: "error", error: parsed.error };
    written = await updateAssignmentCloseTime(supabase, assignmentId, parsed.value.closesAt);
  } else {
    const parsed = parseAssignmentEdit(formData, now);
    if (!parsed.ok) return { status: "error", error: parsed.error };
    written = await updateAssignmentWindow(supabase, assignmentId, parsed.value);
  }
  if (!written.ok) return { status: "error", error: editRefusal(written.reason, closeOnly) };

  revalidatePath(classPath(classId));
  return { status: "saved" };
}

/** Deletes one that has not opened. Once it has, the database refuses and nothing changes. */
export async function deleteAssignment(classId: string, assignmentId: string): Promise<void> {
  const { supabase } = await requireAuthor(classPath(classId));
  if (isUuid(classId) && isUuid(assignmentId)) await removeAssignment(supabase, assignmentId);
  revalidatePath(classPath(classId));
}
