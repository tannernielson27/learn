import { readViewer } from "@/lib/classes/viewer";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/live/displayName";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { readMemberClass } from "@/lib/supabase/sessions";

/**
 * What the join page says about who is joining (ADR 0013).
 *
 * - `none`: signed out, or not a student. Today's page, word for word.
 * - `member`: a signed-in student, and the code in the address is an open live session for one of
 *   their classes. "Joining as … for …", the name filled in, and a way to join as a guest.
 * - `student`: a signed-in student whose class session is not known (no code in the address, or a
 *   code that is not a session of their class). One line on what counts, and the guest way.
 * - `guest`: a signed-in student who chose to join as a guest, with the way back.
 *
 * None of this decides anything. Whether a participant is linked is `join_session`'s own check,
 * made against the account the join action verifies again.
 */
export type JoinAccount =
  | { kind: "none" }
  | { kind: "member"; name: string | null; className: string; guestHref: string }
  | { kind: "student"; name: string | null; guestHref: string }
  | { kind: "guest"; signedInHref: string };

/**
 * `code` is already normalized, and empty when the address carried none. Signed out costs no
 * lookup at all: `getClaims` finds no session cookie, and nothing is asked of the database, so a
 * camera still cannot use this page to probe which codes exist. The class is looked up only for a
 * signed-in student, with the id the server verified, and names only that student's own class.
 */
export async function readJoinAccount(code: string, guest: boolean): Promise<JoinAccount> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out" || viewer.role !== "student") return { kind: "none" };

  const here = code ? `/join/${code}` : "/join";
  if (guest) return { kind: "guest", signedInHref: here };

  const name = viewer.displayName ? viewer.displayName.slice(0, DISPLAY_NAME_MAX_LENGTH) : null;
  const guestHref = `${here}?guest=1`;
  const className = code
    ? await readMemberClass(createSupabaseServiceClient(), code, viewer.userId)
    : null;
  return className
    ? { kind: "member", name, className, guestHref }
    : { kind: "student", name, guestHref };
}
