"use server";

import { refresh } from "next/cache";
import { isUuid } from "@/lib/authoring/ids";
import { requireStudent } from "@/lib/classes/viewer";
import { startPracticeOver } from "@/lib/practice/page";
import { PRACTICE_REFUSALS } from "@/lib/practice/refusals";
import { practicePageStore } from "@/lib/practice/store";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { StartOverState } from "@/components/practice/PracticeStartOver";

/**
 * "Start over" (#241): opens a new run of the bank for the signed-in student, then reads the page
 * again, which now plays the new run. The database checks the share and the membership.
 */
export async function startPracticeOverAction(bankId: string): Promise<StartOverState> {
  const { userId } = await requireStudent();
  if (!isUuid(bankId)) return { error: PRACTICE_REFUSALS.not_found };
  const outcome = await startPracticeOver(
    practicePageStore(createSupabaseServiceClient()),
    sharedRateLimitStore(),
    userId,
    bankId,
  );
  refresh();
  if (outcome === "started") return { error: null };
  return { error: PRACTICE_REFUSALS[outcome] };
}
