"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { InviteLinkState } from "@/components/classes/InviteEmailForm";
import type { JoinClassState } from "@/components/classes/JoinClassButton";
import { sendInviteLink, type InviteLinkDeps } from "@/lib/auth/inviteLink";
import { parseSignInForm } from "@/lib/auth/signInForm";
import {
  clientIp,
  signInAddressCeilingRefusals,
  type RequestHeaders,
  type SignInRateLimitResult,
  takeSignInAddress,
  takeSignInAttempt,
  takeSignInInviteAttempt,
} from "@/lib/auth/signInRateLimit";
import { clipInviteToken, invitePath, STUDENT_HOME } from "@/lib/classes/classes";
import { readViewer } from "@/lib/classes/viewer";
import { canonicalSiteOrigin } from "@/lib/http/siteOrigin";
import { joinClass, resolveClassInvite, type ResolvedInvite } from "@/lib/supabase/classInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The same wording the join-code limit uses: it says something about the network, nothing else. */
const LOOKUPS_LIMITED =
  "Too many invite links tried from this network. Wait a few minutes, then try again.";
const UNAVAILABLE = "Joining is not working just now. Try again in a moment.";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/** The two admin calls `sendInviteLink` makes, on the service-role client. */
function adminCalls(service: ServiceClient): InviteLinkDeps {
  return {
    createUser: (params) => service.auth.admin.createUser(params),
    sendLink: ({ email, redirectTo }) =>
      service.auth.signInWithOtp({
        email,
        // Never creates an account itself: the admin call above is the only thing that does.
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      }),
  };
}

/**
 * Counts the request against the budget its token earned (#217). A token that resolved spends the
 * class's own budget for this caller (`SIGN_IN_INVITE_LIMIT`), so a class behind one campus address
 * is not refused at the thirty-first student. Anything else — an unknown, rotated or malformed
 * token, a caller over the lookup limit, a database that cannot answer — spends #134's per-IP
 * email budget exactly as every invite request did before, and is answered exactly as before:
 * the network message once that budget is spent, the lookup's own answer until then.
 */
function takeInviteBudget(
  requestHeaders: RequestHeaders,
  invite: ResolvedInvite,
): SignInRateLimitResult {
  return invite.status === "open"
    ? takeSignInInviteAttempt(requestHeaders, invite.classId)
    : takeSignInAttempt(requestHeaders, "email");
}

/**
 * The invite page's email form (#205): the only path in the app that creates an account.
 *
 * The token is checked first, with the service role, which counts a wrong token against the
 * address. The request is then counted: a valid token against the class's per-caller budget, and
 * anything else against sign-in's per-IP limit (#134), as `takeInviteBudget` explains. Checking
 * first adds no lookups a caller could not already make — the invite page resolves the token on
 * every render, and `resolve_class_invite` has its own per-address miss limit. #139/#157's two
 * per-recipient counters then apply unchanged. Once the token has resolved, every answer is the
 * same `sent`: a new address, an address that already has an account, one whose budget is spent.
 * The account work and the email happen in `after()`, once the answer has gone back, so not even
 * the time taken can say which it was.
 */
export async function requestInviteLink(
  token: string,
  _previous: InviteLinkState,
  formData: FormData,
): Promise<InviteLinkState> {
  const parsed = parseSignInForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const requestHeaders = await headers();
  const service = createSupabaseServiceClient();
  const invite = await resolveClassInvite(service, token, clientIp(requestHeaders));
  const limit = takeInviteBudget(requestHeaders, invite);
  if (!limit.ok) return { status: "error", error: limit.error };
  if (invite.status === "invalid") return { status: "invalid" };
  if (invite.status === "rate_limited") return { status: "error", error: LOOKUPS_LIMITED };
  if (invite.status === "unavailable") return { status: "error", error: UNAVAILABLE };

  const sent: InviteLinkState = { status: "sent", email: parsed.email };
  const decision = takeSignInAddress(requestHeaders, parsed.email);
  if (decision !== "send") {
    if (decision === "over-address-ceiling") {
      console.warn("[invite] an address reached the deployment-wide ceiling", {
        ceilingRefusals: signInAddressCeilingRefusals(),
      });
    }
    return sent;
  }

  const input = {
    email: parsed.email,
    classId: invite.classId,
    token: clipInviteToken(token),
    origin: canonicalSiteOrigin(requestHeaders),
  };
  after(() => sendInviteLink(input, adminCalls(service)));
  return sent;
}

/**
 * The one-tap join for someone already signed in. `join_class` checks the token again as the
 * caller, so nothing the page rendered is trusted, and it never changes an instructor. Bound to the
 * token by the page; the form state and data React passes after it are not needed.
 */
export async function joinInvitedClass(token: string): Promise<JoinClassState> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") redirect(invitePath(clipInviteToken(token)));

  const answer = await joinClass(viewer.supabase, token);
  if (answer === "instructor") return { status: "instructor" };
  if (answer === "invalid") return { status: "invalid" };
  if (answer === "rate_limited") return { status: "error", error: LOOKUPS_LIMITED };
  if (answer === "unavailable") return { status: "error", error: UNAVAILABLE };
  // Outside every branch above, because redirect() works by throwing.
  redirect(STUDENT_HOME);
}
