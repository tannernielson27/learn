import { createSupabaseServerClient } from "./server";

/**
 * Who is signed in on this browser, as the server verified it (ADR 0013).
 *
 * `getClaims` checks the token rather than trusting the cookie, which is the only thing that makes
 * the id safe to hand to `join_session`: it is never read from anything a request carries in its
 * body. Three answers, because two callers need to tell the last two apart. `signed_out` is a browser
 * with no session at all; `unavailable` is a session that is there but could not be checked (auth
 * down, keys unreachable, a token that did not verify). A browser holding a participant linked to
 * an account is not resumed for a visitor who is `signed_out`, but is for one whose check was
 * `unavailable`: a failed check must not take a member out of the room mid-class (decision 3).
 */
export type VerifiedAccount =
  { status: "signed_in"; id: string } | { status: "signed_out" } | { status: "unavailable" };

export async function verifiedAccount(): Promise<VerifiedAccount> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error) return { status: "unavailable" };
    // `getClaims` answers no session with no data and no error, and nothing else that way.
    if (!data) return { status: "signed_out" };
    const sub = data.claims?.sub;
    return typeof sub === "string" && sub !== ""
      ? { status: "signed_in", id: sub }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
