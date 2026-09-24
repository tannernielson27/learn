"use server";

import { refresh } from "next/cache";
import { ATTEMPT_REFUSALS } from "@/lib/assignments/attemptRefusals";
import { submitStore } from "@/lib/assignments/attemptStore";
import { submitAttempt } from "@/lib/assignments/submitAttempt";
import { isUuid } from "@/lib/authoring/ids";
import { requireStudent } from "@/lib/classes/viewer";
import { startAttempt } from "@/lib/supabase/attempts";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type AttemptActionState = { error: string | null };

/**
 * Starts an attempt (or resumes the open one) as the signed-in student, then reads the page again,
 * which now shows the player. The database checks the window, the membership and the attempts.
 */
export async function startAssignmentAttempt(assignmentId: string): Promise<AttemptActionState> {
  const { supabase } = await requireStudent();
  if (!isUuid(assignmentId)) return { error: ATTEMPT_REFUSALS.not_found };
  const started = await startAttempt(supabase, assignmentId);
  refresh();
  return started.ok ? { error: null } : { error: ATTEMPT_REFUSALS[started.refusal] };
}

/**
 * Submits one of the signed-in student's attempts: scored on the server through `submitAttempt`,
 * recorded by the service role, and answered with nothing but whether it worked. The page is read
 * again either way — it then says "Submitted", or, if the window closed meanwhile, "closed".
 */
export async function submitAssignmentAttempt(
  assignmentId: string,
  attemptId: string,
): Promise<{ error: string } | undefined> {
  const { supabase, userId } = await requireStudent();
  if (!isUuid(assignmentId) || !isUuid(attemptId)) return { error: ATTEMPT_REFUSALS.not_found };
  const outcome = await submitAttempt(
    submitStore(supabase, createSupabaseServiceClient()),
    attemptId,
    userId,
  );
  refresh();
  return outcome.ok ? undefined : { error: ATTEMPT_REFUSALS[outcome.refusal] };
}
