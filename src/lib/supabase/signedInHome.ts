import { afterSignInPath } from "@/lib/auth/landing";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/auth/nextPath";
import type { createSupabaseServerClient } from "./server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * `afterSignInPath` for an account whose verified id the caller already holds: `target`, with the
 * default swapped for that person's own home.
 *
 * The role is read only when it can matter, which is when nowhere was asked for. It comes from the
 * account's own profile row, as `readViewer` reads it. Never throws: if the role cannot be read
 * the default stands, and authoring sends them on as it always has.
 */
export async function homeForAccount(
  supabase: Pick<ServerClient, "from">,
  userId: string,
  target: string,
): Promise<string> {
  if (target !== DEFAULT_AFTER_SIGN_IN) return target;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (error) return target;
    return afterSignInPath(target, data?.role ?? null);
  } catch {
    return target;
  }
}

/**
 * `homeForAccount` for the cookie client that has just signed someone in (#363): the path to
 * redirect to, by the id the verified token carries. Nothing is read, the token included, when
 * somewhere was asked for. Never throws.
 */
export async function signedInTarget(supabase: ServerClient, target: string): Promise<string> {
  if (target !== DEFAULT_AFTER_SIGN_IN) return target;
  try {
    const userId = (await supabase.auth.getClaims()).data?.claims?.sub;
    if (typeof userId !== "string") return target;
    return await homeForAccount(supabase, userId, target);
  } catch {
    return target;
  }
}
