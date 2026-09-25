import { answerPracticeItem } from "@/lib/practice/answerRoute";
import { practiceAnswerStore } from "@/lib/practice/store";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The signed-in student, verified: `getClaims` checks the token rather than trusting the cookie. */
async function verifiedStudent(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" && sub !== "" ? sub : null;
}

/** Checks one practice answer and reveals that one item. See `answerPracticeItem`. */
export async function POST(request: Request): Promise<Response> {
  return answerPracticeItem(request, {
    student: verifiedStudent,
    store: practiceAnswerStore(createSupabaseServiceClient()),
    limiter: sharedRateLimitStore(),
  });
}
