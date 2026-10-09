"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import type { InviteColleagueState } from "@/components/workspace/InviteColleagueForm";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { getMailer } from "@/lib/email";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  countInvitesSince,
  countInvitesToSince,
  createOrgInvite,
  findInvite,
  readWorkspace,
  removeOrgMember,
  revokeOrgInvite,
} from "@/lib/supabase/workspace";
import {
  INVITE_GONE,
  INVITE_NOT_MADE,
  INVITE_REFUSAL_MESSAGES,
  resendInvitation,
  type ResendDeps,
  revokeInvitation,
  sendInvitation,
} from "@/lib/workspace/invite";
import { parseInviteAddress } from "@/lib/workspace/inviteAddress";
import { sendWorkspaceInviteEmail } from "@/lib/workspace/inviteEmail";
import { takeWorkspaceInviteEmail } from "@/lib/workspace/inviteEmailLimit";
import { logMembershipChange, REMOVE_REFUSED, removeColleague } from "@/lib/workspace/membership";
import { WORKSPACE_PATH } from "@/lib/workspace/workspace";

/**
 * The workspace page's four actions: invite a colleague, revoke an invitation, send one again, and
 * remove a colleague.
 *
 * Who is asking is never read from the request. `requireAuthor` checks the role, and then the
 * session is verified with the auth server (`getUser`), not only by the token's signature: the id
 * and address it returns are what `create_org_invite` and the email are given.
 *
 * The raw token `create_org_invite` returns goes from `createOrgInvite` into
 * `sendWorkspaceInviteEmail` inside `sendInvitation`, and nowhere else. No action returns it, logs
 * it, or puts it in a redirect, an error or a cookie; what comes back is a status and a sentence.
 */

type AuthorClient = Awaited<ReturnType<typeof requireAuthor>>["supabase"];

interface VerifiedAuthor {
  supabase: AuthorClient;
  orgId: string;
  userId: string;
  email: string;
}

async function verifiedAuthor(): Promise<VerifiedAuthor> {
  const { supabase, orgId } = await requireAuthor(WORKSPACE_PATH);
  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(WORKSPACE_PATH)}`);
  return { supabase, orgId, userId: user.id, email: user.email ?? "" };
}

/**
 * The database as each role, and the mailer. The service-role client makes one call,
 * `create_org_invite`; everything else runs as the signed-in teacher, so `revoke_org_invite` and
 * row level security keep it to their own workspace. Built inside the closures, so a deployment
 * with no secret key or no mailer is an invitation that could not be made, not a crashed page.
 */
async function inviteDeps(supabase: AuthorClient): Promise<ResendDeps> {
  const requestHeaders = await headers();
  return {
    create: async (inviterId, email) =>
      createOrgInvite(createSupabaseServiceClient(), inviterId, email),
    revoke: (inviteId) => revokeOrgInvite(supabase, inviteId),
    send: async (invite) =>
      sendWorkspaceInviteEmail(invite, {
        requestHeaders,
        mailer: getMailer(),
        allow: (inviterId) => takeWorkspaceInviteEmail(inviterId),
      }),
    find: (inviteId) => findInvite(supabase, inviteId),
    recentCount: (inviterId, since) => countInvitesSince(supabase, inviterId, since),
    recipientCount: (email, since) => countInvitesToSince(supabase, email, since),
    now: () => new Date(),
  };
}

/** Invites one address into the teacher's own workspace and emails it the link. */
export async function inviteColleague(
  _previous: InviteColleagueState,
  formData: FormData,
): Promise<InviteColleagueState> {
  const { supabase, orgId, userId, email } = await verifiedAuthor();
  const parsed = parseInviteAddress(formData.get("email"));
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const workspace = await readWorkspace(supabase, orgId);
  if (!workspace || !email) return { status: "error", error: INVITE_NOT_MADE };
  // The database refuses this too; asking it would only spend a call.
  if (!workspace.selfRegistered) {
    return { status: "error", error: INVITE_REFUSAL_MESSAGES.shared_workspace };
  }

  const outcome = await sendInvitation(
    { id: userId, email, workspaceName: workspace.name },
    parsed.email,
    await inviteDeps(supabase),
  );
  revalidatePath(WORKSPACE_PATH);
  return outcome.ok
    ? { status: "sent", email: outcome.email }
    : { status: "error", error: outcome.message };
}

/**
 * Revokes one invitation. The id is the page's, from the teacher's own rows; whatever else
 * arrives here, `revoke_org_invite` answers `not_found` for it and says no more.
 */
export async function revokeInvite(inviteId: string): Promise<ConfirmOutcome> {
  const { supabase } = await verifiedAuthor();
  if (!isUuid(inviteId)) return { ok: false, message: INVITE_GONE };
  const outcome = await revokeInvitation(inviteId, {
    revoke: (id) => revokeOrgInvite(supabase, id),
  });
  revalidatePath(WORKSPACE_PATH);
  return outcome;
}

/**
 * Sends an invitation again: the earlier one is revoked and a new one made for the same address,
 * read from the teacher's own row, never from the request. See `resendInvitation`.
 */
export async function resendInvite(inviteId: string): Promise<ConfirmOutcome> {
  const { supabase, orgId, userId, email } = await verifiedAuthor();
  if (!isUuid(inviteId)) return { ok: false, message: INVITE_GONE };

  const workspace = await readWorkspace(supabase, orgId);
  if (!workspace || !email) return { ok: false, message: INVITE_NOT_MADE };
  if (!workspace.selfRegistered) {
    return { ok: false, message: INVITE_REFUSAL_MESSAGES.shared_workspace };
  }

  const outcome = await resendInvitation(
    { id: userId, email, workspaceName: workspace.name },
    inviteId,
    await inviteDeps(supabase),
  );
  revalidatePath(WORKSPACE_PATH);
  return outcome.ok ? { ok: true } : { ok: false, message: outcome.message };
}

/**
 * Removes one colleague from the workspace (ADR 0011). Run as the signed-in teacher:
 * `remove_org_member` reads who is asking from the session and answers only its founder, so
 * nothing here decides who may. The id is the page's, from the member list; for anything else the
 * function answers `not_found` and says no more.
 */
export async function removeMember(memberId: string): Promise<ConfirmOutcome> {
  const { supabase, orgId, userId } = await verifiedAuthor();
  if (!isUuid(memberId)) return { ok: false, message: REMOVE_REFUSED.not_found };
  const outcome = await removeColleague(memberId, {
    remove: (id) => removeOrgMember(supabase, id),
  });
  if (outcome.ok) {
    logMembershipChange("member_removed", { actor: userId, target: memberId, org: orgId });
  }
  revalidatePath(WORKSPACE_PATH);
  return outcome;
}
