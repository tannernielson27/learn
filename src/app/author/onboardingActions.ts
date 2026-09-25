"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SampleImportState } from "@/components/onboarding/ImportSampleForm";
import { requireAuthor } from "@/lib/authoring/session";
import { GET_STARTED_COOKIE, GET_STARTED_COOKIE_MAX_AGE } from "@/lib/onboarding/checklist";
import { importSampleBank } from "@/lib/onboarding/sampleImport";

/**
 * Imports the sample bank into the caller's org and opens it, or opens the Sample bank the org
 * already has (#265). Instructor-only through `requireAuthor`; the org is the caller's own. The
 * form's state and data carry nothing it needs, so it reads neither.
 */
export async function importSample(): Promise<SampleImportState> {
  const { supabase, orgId, userId } = await requireAuthor("/author");
  const result = await importSampleBank(supabase, { orgId, userId });
  if (!result.ok) return { status: "error", error: result.error };

  revalidatePath("/author");
  redirect(`/author/banks/${result.bankId}`);
}

/** Hides Get started on this browser for this account. Nothing is stored in the database. */
export async function hideGetStarted(): Promise<void> {
  const { userId } = await requireAuthor("/author");
  (await cookies()).set(GET_STARTED_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/author",
    maxAge: GET_STARTED_COOKIE_MAX_AGE,
  });
  revalidatePath("/author");
}
