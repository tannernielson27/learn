import { redirect } from "next/navigation";
import { requireAuthor, type AuthorSession } from "./session";
import { authorReadOnly } from "./readOnly";

/** Where a refused write lands: the one sentence and the way to Billing (#521). */
export const READ_ONLY_PATH = "/author/read-only";

/** The read-only page for a write refused on `returnTo`, which it links back to. */
export function readOnlyPath(returnTo: string): string {
  return `${READ_ONLY_PATH}?next=${encodeURIComponent(returnTo)}`;
}

/**
 * The gate every authoring Server Function that creates, changes or runs something starts with
 * (#521): `requireAuthor`, and then, when billing is enforced and the workspace has no access, a
 * redirect to the read-only page, which says in one sentence why and links to Billing (or says to
 * ask the person who started the workspace). Reads use `requireAuthor` and are never refused.
 *
 * With `BILLING_ENFORCED` unset this is exactly `requireAuthor`: nothing more is read.
 *
 * The database refuses the same writes by itself (`private.write_allowed()` in the write policies
 * and functions), so a write that does not go through here is still refused; this is what turns
 * that refusal into a sentence rather than an error.
 */
export async function requireWriter(returnTo: string): Promise<AuthorSession> {
  const session = await requireAuthor(returnTo);
  // `requireAuthor` read it already; a session handed over without the key is read here.
  const readOnly =
    "readOnly" in session ? session.readOnly : await authorReadOnly(session.supabase);
  if (readOnly) redirect(readOnlyPath(returnTo));
  const { supabase, userId, email, orgId } = session;
  return { supabase, userId, email, orgId };
}
