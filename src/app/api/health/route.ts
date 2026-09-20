import { readSupabasePublicEnv } from "@/lib/supabase/env";
import { checkSupabaseHealth } from "@/lib/supabase/health";
import { supabaseProjectRef } from "@/lib/supabase/projectRef";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Reports whether the deployment can reach Supabase, and which project that is. The project ref
 * is the public part of the project URL, so production and a preview can be told apart from the
 * outside (ADR 0006). Keys, full URLs and errors are never echoed.
 */
export async function GET(): Promise<Response> {
  let env;
  try {
    env = readSupabasePublicEnv();
  } catch {
    return Response.json(
      {
        supabase: "not_configured",
        project: supabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const { status, project } = await checkSupabaseHealth(env);
  return Response.json(
    { supabase: status, project },
    { status: status === "ok" ? 200 : 503, headers: NO_STORE },
  );
}
