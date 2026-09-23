"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClassFormState } from "@/components/classes/ClassNameForm";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { classPath, CLASSES_PATH, parseClassForm } from "@/lib/classes/classes";
import {
  createClass as insertClass,
  removeStudent as deleteMembership,
  renameClass as updateClassName,
  rotateInvite as rotateToken,
} from "@/lib/supabase/classes";

const GONE = "That class no longer exists.";

/** Creates a class in the author's org and opens it, where the invite link is. */
export async function createClass(
  _previous: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  const parsed = parseClassForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase } = await requireAuthor(CLASSES_PATH);
  const created = await insertClass(supabase, parsed.name);
  if (!created.ok) return { status: "error", error: "The class could not be created. Try again." };

  revalidatePath(CLASSES_PATH);
  redirect(classPath(created.id));
}

export async function renameClass(
  classId: string,
  _previous: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  if (!isUuid(classId)) return { status: "error", error: GONE };
  const parsed = parseClassForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase } = await requireAuthor(classPath(classId));
  if (!(await updateClassName(supabase, classId, parsed.name))) {
    return { status: "error", error: GONE };
  }
  revalidatePath(classPath(classId));
  revalidatePath(CLASSES_PATH);
  return { status: "saved" };
}

/** A new invite token; the old link stops working at once. */
export async function rotateInvite(classId: string): Promise<void> {
  const { supabase } = await requireAuthor(classPath(classId));
  if (isUuid(classId)) await rotateToken(supabase, classId);
  revalidatePath(classPath(classId));
}

/** Takes one student off the class. Their account is kept. */
export async function removeStudent(classId: string, profileId: string): Promise<void> {
  const { supabase } = await requireAuthor(classPath(classId));
  if (isUuid(classId) && isUuid(profileId)) await deleteMembership(supabase, classId, profileId);
  revalidatePath(classPath(classId));
}
