import { saveAttemptAnswer } from "@/lib/assignments/saveRoute";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Autosaves one answer of the signed-in student's open attempt. See `saveAttemptAnswer`. */
export async function POST(request: Request): Promise<Response> {
  return saveAttemptAnswer(request, { client: createSupabaseServerClient });
}
