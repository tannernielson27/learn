"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JoinState } from "@/components/live/JoinForm";
import { clientIp } from "@/lib/auth/signInRateLimit";
import { parseJoinForm } from "@/lib/live/joinForm";
import {
  formatParticipantToken,
  PARTICIPANT_COOKIE,
  participantCookieOptions,
  parseParticipantToken,
} from "@/lib/live/participantToken";
import { playPath } from "@/lib/live/routes";
import { joinSession, resumeParticipant } from "@/lib/supabase/participants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { resolveSessionCode } from "@/lib/supabase/sessions";

/**
 * One sentence for a code that never existed and for a session that has ended. #128's
 * `resolve_session_code` answers both with no rows on purpose, so that a script cannot harvest
 * live codes by watching which refusals differ; saying so here would give that back.
 */
const UNKNOWN_CODE = "That code does not match a session that is open. Check it and try again.";

/** The same wording the sign-in limit uses, for the same reason: it names nothing. */
const RATE_LIMITED =
  "Too many join attempts from this network. Wait a few minutes, then try again.";

const UNAVAILABLE = "Joining is not working just now. Try again in a moment.";

const SESSION_FULL = "That session is full.";

/**
 * Joins a session, or comes back to the one this browser is already in.
 *
 * The order matters. The code is resolved first, by the service-role client, because that is what
 * counts a wrong guess against the address and what keeps a guessing script away from everything
 * below it. Only a session id that came back from that lookup is ever passed on, so nothing a
 * browser posts chooses which session is joined.
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

  // Already in this room: a back button, a double-tapped Join, or the same code typed twice. Come
  // back as the participant this browser already is rather than leaving a second name in the
  // roster. A token for a different session is ignored, not resumed — joining a new room replaces
  // the old one.
  const returning =
    held && held.sessionId === resolved.sessionId ? await resumeParticipant(service, held) : null;

  let token = held;
  if (!returning) {
    const joined = await joinSession(service, resolved.sessionId, parsed.displayName);
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
