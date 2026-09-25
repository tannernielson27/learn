"use server";

import { revalidatePath } from "next/cache";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import type { ShareFormState } from "@/components/practice/PracticeShareForm";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { classPath } from "@/lib/classes/classes";
import { parseShareTarget, shareRefusal } from "@/lib/practice/shares";
import { sharePractice, stopPractice } from "@/lib/supabase/practiceShares";

/**
 * Sharing a bank with a class for practice, and stopping it (#240). The database decides who may:
 * an author of the org, for a bank and a class of that org. These only check the shape of the ids.
 */

const bankPath = (bankId: string) => `/author/banks/${bankId}`;
const CHOOSE: ShareFormState = { status: "error", error: "Choose from the list." };
const STOP_FAILED: ConfirmOutcome = {
  ok: false,
  message: "Could not stop sharing this bank. Try again.",
};

/** Every page that shows a share: the bank list's badges, the bank page and the class page. */
function revalidateShare(bankId: string, classId: string): void {
  revalidatePath("/author");
  revalidatePath(bankPath(bankId));
  revalidatePath(classPath(classId));
}

async function share(returnTo: string, bankId: string, classId: string): Promise<ShareFormState> {
  const { supabase } = await requireAuthor(returnTo);
  const outcome = await sharePractice(supabase, bankId, classId);
  if (!outcome.ok) return { status: "error", error: shareRefusal(outcome.reason) };
  revalidateShare(bankId, classId);
  return { status: "shared" };
}

/** From the bank page: the form chooses the class. */
export async function shareBankWithClass(
  bankId: string,
  _previous: ShareFormState,
  formData: FormData,
): Promise<ShareFormState> {
  if (!isUuid(bankId)) return { status: "error", error: shareRefusal("gone") };
  const target = parseShareTarget(formData);
  if (!target.ok) return CHOOSE;
  return share(bankPath(bankId), bankId, target.id);
}

/** From the class page: the form chooses the bank. */
export async function shareClassWithBank(
  classId: string,
  _previous: ShareFormState,
  formData: FormData,
): Promise<ShareFormState> {
  if (!isUuid(classId)) return { status: "error", error: shareRefusal("gone") };
  const target = parseShareTarget(formData);
  if (!target.ok) return CHOOSE;
  return share(classPath(classId), target.id, classId);
}

/**
 * Stops one share. The bank leaves the class's practice list at once; answers already seen stay
 * seen, which the confirmation says before this runs. A share someone else already stopped is
 * done; a refused delete says so, so nobody believes a bank is private when it is not (#256).
 */
export async function stopSharing(bankId: string, classId: string): Promise<ConfirmOutcome> {
  if (!isUuid(bankId) || !isUuid(classId)) return STOP_FAILED;
  const { supabase } = await requireAuthor(bankPath(bankId));
  const write = await stopPractice(supabase, bankId, classId);
  if (!write.ok) {
    console.error("[practice] a share could not be stopped", { bankId, classId, code: write.code });
    return STOP_FAILED;
  }
  revalidateShare(bankId, classId);
  return { ok: true };
}
