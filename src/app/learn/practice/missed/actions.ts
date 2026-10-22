"use server";

import { redirect } from "next/navigation";
import { isUuid } from "@/lib/authoring/ids";
import { requireStudent } from "@/lib/classes/viewer";
import { MISSED_REFUSALS, startMissedPractice, type MissedSourceRef } from "@/lib/practice/missed";
import { missedPracticePath } from "@/lib/practice/paths";
import { missedStore } from "@/lib/practice/store";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type PractiseMissedState = { error: string | null };

/**
 * "Practise the N I missed" (owner decision 6). The browser names only the source; which
 * questions were missed is read on the server, and the database checks them against the same
 * source before the run starts. On success the student is taken to the new run.
 */
async function practiseMissed(source: MissedSourceRef): Promise<PractiseMissedState> {
  const { supabase, userId } = await requireStudent();
  const outcome = await startMissedPractice(
    missedStore(supabase, createSupabaseServiceClient()),
    sharedRateLimitStore(),
    userId,
    source,
  );
  if (outcome.kind === "started") redirect(missedPracticePath(outcome.runId));
  return { error: MISSED_REFUSALS[outcome.kind] };
}

/** From a practice run the student has just finished. Bound to the run on the server. */
export async function practiseMissedFromRunAction(runId: string): Promise<PractiseMissedState> {
  if (!isUuid(runId)) return { error: MISSED_REFUSALS.not_found };
  return practiseMissed({ kind: "run", runId });
}

/** From an assignment's released results. Bound to the assignment on the server. */
export async function practiseMissedFromAssignmentAction(
  assignmentId: string,
): Promise<PractiseMissedState> {
  if (!isUuid(assignmentId)) return { error: MISSED_REFUSALS.not_found };
  return practiseMissed({ kind: "assignment", assignmentId });
}
