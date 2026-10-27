"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JoinState } from "@/components/live/JoinForm";
import { clientIp } from "@/lib/auth/signInRateLimit";
import { JOIN_REFUSALS, parseJoinForm } from "@/lib/live/joinForm";
import {
  formatParticipantToken,
  PARTICIPANT_COOKIE,
  participantCookieOptions,
  parseParticipantToken,
} from "@/lib/live/participantToken";
import { playPath } from "@/lib/live/routes";
import { checkParticipant, joinSession, participantLink } from "@/lib/supabase/participants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { resolveSessionCode } from "@/lib/supabase/sessions";
import { verifiedAccount } from "@/lib/supabase/verifiedAccount";

/**
 * One sentence for a code that never existed and for a session that has ended. #128's
 * `resolve_session_code` answers both with no rows on purpose, so that a script cannot harvest
 * live codes by watching which refusals differ; saying so here would give that back.
 */
const UNKNOWN_CODE = JOIN_REFUSALS.unknown;

/** The same wording the sign-in limit uses, for the same reason: it names nothing. */
const RATE_LIMITED = JOIN_REFUSALS.rateLimited;

const UNAVAILABLE = JOIN_REFUSALS.unavailable;

const SESSION_FULL = JOIN_REFUSALS.full;

/**
 * Joins a session, or comes back to the one this browser is already in.
 *
 * The order matters. The code is resolved first, by the service-role client, because that is what
 * counts a wrong guess against the address and what keeps a guessing script away from everything
 * below it. Only a session id that came back from that lookup is ever passed on, so nothing a
 * browser posts chooses which session is joined.
 *
 * A live session for a class (ADR 0013) links a signed-in member of that class to their account.
 * The account is the one the server verifies from the session cookie, never an id the form posts,
 * and `join_session` decides in SQL whether it is a member; this only says who is signed in. The
 * form's `guest` field (the join page's "Join as a guest instead") can only take an account away.
 */
export async function joinLiveSession(
  _previous: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const parsed = parseJoinForm(formData);
  if (!parsed.ok) return { status: "error", field: parsed.field, error: parsed.error };

  const requestHeaders = await headers();
  const service = createSupabaseServiceClient();
  // The same address derivation the sign-in limit uses (#134), not a second one.
  const resolved = await resolveSessionCode(service, parsed.code, clientIp(requestHeaders));

  if (resolved.status === "unknown") {
    return { status: "error", field: "code", error: UNKNOWN_CODE };
  }
  if (resolved.status === "rate_limited") {
    return { status: "error", field: "code", error: RATE_LIMITED };
  }
  if (resolved.status === "unavailable") {
    return { status: "error", error: UNAVAILABLE };
  }

  const cookieStore = await cookies();
  const held = parseParticipantToken(cookieStore.get(PARTICIPANT_COOKIE)?.value);
  const asGuest = formData.get("guest") === "1";

  // Already in this room: a back button, a double-tapped Join, or the same code typed twice. Come
  // back as the participant this browser already is rather than leaving a second name in the
  // roster. A token for a different session is ignored, not resumed — joining a new room replaces
  // the old one.
  const checked =
    held && held.sessionId === resolved.sessionId ? await checkParticipant(service, held) : null;
  // A database that did not answer has not said this browser is nobody. Joining again would leave
  // a second name for one student in the room, and the first one's answers behind it.
  if (checked !== null && !checked.ok && checked.reason === "unavailable") {
    return { status: "error", error: UNAVAILABLE };
  }

  let returning = checked !== null && checked.ok;
  // Who is signed in, read only when something needs it: a browser coming back, or a join that
  // may link. A guest's join with no participant to come back to reads nothing, as before.
  const viewer = returning || !asGuest ? await verifiedAccount() : null;
  const account = viewer?.status === "signed_in" ? viewer.id : null;

  // A browser is not a person (ADR 0013). On a shared laptop the cookie may be the last
  // student's: nobody comes back as a participant linked to an account other than the one signed
  // in, signed out included, and a current member of the session's class who holds an anonymous
  // participant joins as themselves rather than staying that guest (unless they chose "Join as a
  // guest instead"). Signed out, a browser holding an anonymous participant comes back as it, as
  // before. An account that could not be checked is asked nothing: the browser comes back as
  // whoever it already is (decision 3), which is what it did before anyone was ever linked.
  if (returning && held && viewer !== null && viewer.status !== "unavailable") {
    const link = await participantLink(service, held, account);
    if (!link.ok && link.reason === "unavailable") return { status: "error", error: UNAVAILABLE };
    returning =
      link.ok &&
      (link.linkedProfile !== null
        ? link.linkedProfile === account
        : asGuest || !link.accountIsMember);
  }

  let token = held;
  if (!returning) {
    const joined = await joinSession(
      service,
      resolved.sessionId,
      parsed.displayName,
      asGuest ? null : account,
    );
    if (!joined.ok) {
      if (joined.reason === "full") return { status: "error", error: SESSION_FULL };
      // "gone" and "ended" both mean the host closed the room between resolving the code and
      // this call. The person typed a code that was open a moment ago, so they are told what
      // everyone else typing it is told.
      if (joined.reason === "gone" || joined.reason === "ended") {
        return { status: "error", field: "code", error: UNKNOWN_CODE };
      }
      return { status: "error", error: UNAVAILABLE };
    }

    token = {
      sessionId: resolved.sessionId,
      participantId: joined.participant.participantId,
      secret: joined.participant.secret,
    };
  }

  // Written on the way back in as well as on the way in, so a long afternoon does not expire a
  // token under someone who is still in the room. The cookie's twelve hours therefore run from
  // the last time the join page was used, not from the first.
  if (token) {
    cookieStore.set(
      PARTICIPANT_COOKIE,
      formatParticipantToken(token),
      // Not from the request's own protocol: a forged x-forwarded-proto would then be a way to
      // ask for the Secure attribute to be dropped. Browsers treat localhost as secure, so the
      // production build the e2e suite runs still sets a Secure cookie over http://localhost.
      participantCookieOptions(process.env.NODE_ENV === "production"),
    );
  }

  // Outside every branch above, because redirect() works by throwing.
  redirect(playPath(resolved.sessionId));
}
