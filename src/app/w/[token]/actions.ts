"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseAccountName } from "@/lib/auth/displayName";
import { EMAIL_UNCONFIRMED_KEY } from "@/lib/auth/emailConfirmation";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/auth/nextPath";
import { checkNewPassword, PASSWORD_WEAK } from "@/lib/auth/password";
import { clientIp } from "@/lib/auth/signInRateLimit";
import { earlierAccessDeps } from "@/lib/supabase/emailConfirmed";
import { acceptOrgInvite, resolveOrgInvite } from "@/lib/supabase/orgInvites";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { acceptAsSignedIn, createAndAccept } from "@/lib/workspace/acceptInvite";
import { takeInviteAcceptAttempt } from "@/lib/workspace/acceptLimit";
import {
  type InviteAccountState,
  type InviteAnswer,
  INVITE_UNAVAILABLE,
  inviteAnswerFor,
  type JoinWorkspaceState,
  workspaceInvitePath,
} from "@/lib/workspace/invite";
import { type ConfirmedMove, logMembershipChange, moveConfirmed } from "@/lib/workspace/membership";

const ACCOUNT_FAILED = "Your account could not be created just now. Try again in a moment.";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * The token, looked up again on every post with the caller's trusted address, so a wrong one is
 * counted (`accept_org_invite` counts nothing itself). Answers the pending invitation, or what the
 * page should show instead.
 */
async function pendingInvite(
  service: ServiceClient,
  token: string,
  ip: string | null,
): Promise<
  { ok: true; invitedEmail: string; expiresAt: string } | { ok: false; answer: InviteAnswer }
> {
  const invite = await resolveOrgInvite(service, token, ip);
  if (invite.status === "invalid") return { ok: false, answer: { status: "invalid" } };
  if (invite.status === "unavailable") {
    return { ok: false, answer: { status: "error", error: INVITE_UNAVAILABLE } };
  }
  if (invite.state !== "pending") {
    return { ok: false, answer: { status: "closed", state: invite.state } };
  }
  return { ok: true, invitedEmail: invite.invitedEmail, expiresAt: invite.expiresAt };
}

/**
 * "Join workspace", for someone signed in (owner decisions 2026-10-08). The only thing that
 * accepts an invitation for an existing account, and a Server Function: opening the link accepts
 * nothing, and Next refuses a post whose Origin is not this site.
 *
 * The account is the one this request's session belongs to, asked of Supabase Auth
 * (`auth.getUser()`), never an id the request carries. That also hands over the account's stored
 * `learn_email_unconfirmed`, read before anything is changed. Both database calls are made with
 * the service role, which is the only role granted them. What follows `accepted` is
 * `acceptAsSignedIn`'s.
 *
 * `move` is passed to the database and decides nothing here. It matters only for an account
 * that already teaches: `accept_org_invite` moves such an account only when the move is
 * confirmed for the workspace it teaches in at that moment, and otherwise answers
 * `move_needs_confirmation` having written nothing (ADR 0011). Every protection above holds for a
 * move exactly as for a first acceptance, the #378 password retirement included, and a move also
 * signs out the account's other sessions (`acceptAsSignedIn`).
 */
async function acceptAsThisAccount(
  token: string,
  move: ConfirmedMove | null,
): Promise<JoinWorkspaceState> {
  const requestHeaders = await headers();
  const allowed = await takeInviteAcceptAttempt(requestHeaders);
  if (!allowed.ok) return { status: "error", error: allowed.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;
  // Signed out meanwhile: the page knows what to offer a visitor.
  if (!user) redirect(workspaceInvitePath(token));

  const service = createSupabaseServiceClient();
  const invite = await pendingInvite(service, token, clientIp(requestHeaders));
  if (!invite.ok) return invite.answer;

  const claims = (await supabase.auth.getClaims()).data?.claims;
  const outcome = await acceptAsSignedIn(
    {
      userId: user.id,
      wasUnconfirmed: user.app_metadata?.[EMAIL_UNCONFIRMED_KEY] === true,
      // Only this account's own session says when it signed in.
      claims: claims?.sub === user.id ? claims : null,
      inviteExpiresAt: invite.expiresAt,
      move: move !== null,
    },
    {
      accept: (userId) => acceptOrgInvite(service, userId, token, move),
      clearUnconfirmed: (userId) =>
        service.auth.admin.updateUserById(userId, {
          // Null removes the one key; Supabase Auth leaves the rest of app_metadata as it is.
          app_metadata: { [EMAIL_UNCONFIRMED_KEY]: null },
        }),
      refresh: () => supabase.auth.refreshSession(),
      earlierAccess: earlierAccessDeps(supabase),
    },
  );
  if (outcome.result !== "accepted") return inviteAnswerFor(outcome.result);
  // The workspace left, by id. The one joined is on the invitation row `accepted_by` now names.
  if (move)
    logMembershipChange("teacher_moved", { actor: user.id, target: user.id, org: move.leaving });
  // Outside any try, because redirect() works by throwing.
  redirect(outcome.next);
}

/**
 * "Join workspace", for a signed-in account with no role. Bound to the token by the page; the
 * form state and data React passes after it are not needed, and nothing is read from them. It
 * never confirms a move: an account that came to teach somewhere between the page and the press
 * is told to reload, and nothing is changed.
 */
export async function acceptInvitation(token: string): Promise<JoinWorkspaceState> {
  return acceptAsThisAccount(token, null);
}

/**
 * "Leave and join workspace", for a signed-in account that already teaches in a workspace of its
 * own. Two things are read from the form: whether the box that names the workspace being left
 * was ticked, and that workspace's id, which the page put there from the preview. A post without
 * either reaches the database as an unconfirmed accept, which it refuses; one with an id that is
 * not the account's workspace at that moment is refused the same way.
 */
export async function moveToInvitedWorkspace(
  token: string,
  _previous: JoinWorkspaceState,
  formData: FormData,
): Promise<JoinWorkspaceState> {
  return acceptAsThisAccount(token, moveConfirmed(formData));
}

/**
 * The invitation page's form for someone with no account: a name and a password. The address is
 * the invited one, read from the database by the token; the form posts none and none is read.
 *
 * No CAPTCHA, where sign-up has one. Sign-up's stands in front of what that form gives away, which
 * is whether an address the visitor chose has an account. Here the visitor chooses no address: the
 * only one this can ask about is the invited one, and only for someone holding the 192-bit token
 * that was emailed to it. So it is counted per caller instead (`takeInviteAcceptAttempt`), on top
 * of the lookup's own miss limit.
 *
 * Someone already signed in is sent back to the page, which offers the button instead.
 */
export async function createAccountAndAccept(
  token: string,
  _previous: InviteAccountState,
  formData: FormData,
): Promise<InviteAccountState> {
  const name = parseAccountName(formData.get("displayName"));
  if (!name.ok) return { status: "error", error: name.error, field: "displayName" };
  const password = checkNewPassword(formData.get("password"));
  if (!password.ok) return { status: "error", error: password.error, field: "password" };

  const requestHeaders = await headers();
  const allowed = await takeInviteAcceptAttempt(requestHeaders);
  if (!allowed.ok) return { status: "error", error: allowed.error, field: null };

  const supabase = await createSupabaseServerClient();
  const signedIn = await supabase.auth.getUser();
  if (!signedIn.error && signedIn.data.user) redirect(workspaceInvitePath(token));

  const service = createSupabaseServiceClient();
  const invite = await pendingInvite(service, token, clientIp(requestHeaders));
  if (!invite.ok) {
    return invite.answer.status === "error" ? { ...invite.answer, field: null } : invite.answer;
  }

  const result = await createAndAccept(
    { email: invite.invitedEmail, password: password.password, displayName: name.name },
    {
      createUser: (params) => service.auth.admin.createUser(params),
      saveName: async (userId, displayName) =>
        await service.from("profiles").update({ display_name: displayName }).eq("id", userId),
      // The id is the one `createUser` returned, never one the request carried.
      accept: (userId) => acceptOrgInvite(service, userId, token),
      signIn: (credentials) => supabase.auth.signInWithPassword(credentials),
    },
  );

  if (result.status === "exists") return { status: "exists" };
  if (result.status === "weak") return { status: "error", error: PASSWORD_WEAK, field: "password" };
  if (result.status === "failed") return { status: "error", error: ACCOUNT_FAILED, field: null };
  if (result.result !== "accepted") {
    const answer = inviteAnswerFor(result.result);
    return answer.status === "error" ? { ...answer, field: null } : answer;
  }
  if (!result.signedIn) return { status: "created_signed_out" };
  redirect(DEFAULT_AFTER_SIGN_IN);
}

/**
 * "Sign out", for someone who opened an invitation signed in as another address: signs this
 * browser out and comes back to the invitation, now as a visitor.
 */
export async function signOutToInvitation(token: string): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(workspaceInvitePath(token));
}
