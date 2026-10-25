import { createSupabaseServerClient } from "./server";

/**
 * The signed-in account's id, verified, or null for a visitor who is not signed in.
 *
 * `getClaims` checks the token rather than trusting the cookie, which is the only thing that makes
 * the id safe to hand to `join_session` (ADR 0013): it is never read from anything a request
 * carries in its body. Anything that goes wrong reads as signed out, because the one caller is the
 * join action, and a student who cannot be recognised still joins the live session, as a guest.
 */
export async function verifiedAccountId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return typeof sub === "string" && sub !== "" ? sub : null;
  } catch {
    return null;
  }
}
