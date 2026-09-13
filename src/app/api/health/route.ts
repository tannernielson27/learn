import { readSupabasePublicEnv } from "@/lib/supabase/env";
import { checkSupabaseHealth } from "@/lib/supabase/health";

const NO_STORE = { "Cache-Control": "no-store" };

/** Reports whether the deployment can reach Supabase. Never echoes keys, URLs or errors. */
export async function GET(): Promise<Response> {
  let env;
  try {
    env = readSupabasePublicEnv();
  } catch {
    return Response.json({ supabase: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  const { status } = await checkSupabaseHealth(env);
  return Response.json(
    { supabase: status },
    { status: status === "ok" ? 200 : 503, headers: NO_STORE },
  );
}
