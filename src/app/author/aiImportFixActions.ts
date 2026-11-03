"use server";

import { revalidatePath } from "next/cache";
import { saveEntryFix } from "@/lib/aiImport/review/fix";
import { requireWriter } from "@/lib/authoring/writer";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Saves a teacher's fix to a staged AI import question (#347). It checks the caller itself
 * (`saveEntryFix`): a Server Function is a public endpoint, whatever page it was handed to.
 */
export async function saveAiImportEntryFix(input: unknown) {
  const session = await requireWriter("/author");
  const result = await saveEntryFix(
    { author: async () => ({ status: "ok", ...session }), service: createSupabaseServiceClient },
    input,
  );
  if (result.ok) revalidatePath("/author/banks/[bankId]/ai-import/[batchId]", "page");
  return result;
}
