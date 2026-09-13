import { NextResponse, type NextRequest } from "next/server";
import { confirmRedirect } from "@/lib/auth/confirm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The sign-in email's link lands here: verify it, set the session, send the person on. */
export async function GET(request: NextRequest): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const target = await confirmRedirect(new URL(request.url), (params) =>
    supabase.auth.verifyOtp(params),
  );
  return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store" } });
}
