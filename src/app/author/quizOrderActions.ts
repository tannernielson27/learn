"use server";

import { revalidatePath } from "next/cache";
import type { QuizOrderState } from "@/components/authoring/QuizOrderEditor";
import { isUuid } from "@/lib/authoring/ids";
import { parseQuizOrderForm, QUIZ_ORDER_ERRORS } from "@/lib/authoring/quizOrder";
import { saveQuizOrder } from "@/lib/authoring/quizOrderData";
import { requireAuthor } from "@/lib/authoring/session";

// #468: one quiz's order, saved whole in one database call under the caller's RLS, so another
// workspace's quiz matches nothing and a stale page is refused rather than half applied.

/** Saves the order the Change order screen holds. Bound to the quiz in hand. */
export async function saveQuizOrderAction(
  bankId: string,
  _previous: QuizOrderState,
  formData: FormData,
): Promise<QuizOrderState> {
  if (!isUuid(bankId)) return { status: "error", error: QUIZ_ORDER_ERRORS.gone };
  const parsed = parseQuizOrderForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase } = await requireAuthor(`/author/banks/${bankId}/order`);
  const saved = await saveQuizOrder(supabase, bankId, parsed.ids);
  if (!saved.ok) return { status: "error", error: saved.error };

  revalidatePath(`/author/banks/${bankId}`);
  revalidatePath(`/author/banks/${bankId}/order`);
  return { status: "done", message: "Order saved." };
}
