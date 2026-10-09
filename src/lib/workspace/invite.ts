import type {
  CreatedInvite,
  FoundInvite,
  InviteRefusal,
  RevokedInvite,
} from "@/lib/supabase/workspace";
import { parseInviteAddress } from "./inviteAddress";
import type { WorkspaceInvite, WorkspaceInviteEmailResult } from "./inviteEmail";
import { WORKSPACE_DAILY_INVITES, WORKSPACE_MEMBER_CAP, WORKSPACE_PENDING_CAP } from "./workspace";

/**
 * Inviting a colleague, revoking an invitation and sending one again, as the workspace page's
 * Server Functions run them. Everything that touches the database or the mailer is handed in, so
 * the order of the steps and the sentence each ending gets are tested here without either.
 *
 * The raw token is held between `create` and `send` and goes nowhere else: no outcome carries it
 * and no log line does.
 */

/** What an action tells the teacher. A failure is a plain sentence, never the database's text. */
export type InviteOutcome = { ok: true; email: string } | { ok: false; message: string };

export type RevokeOutcome = { ok: true } | { ok: false; message: string };

/** The signed-in teacher, as the server verified them, and the workspace they are in. */
export interface Inviter {
  id: string;
  email: string;
  workspaceName: string;
}

export interface InviteDeps {
  /** `create_org_invite` as the service role, for the verified inviter. */
  create(inviterId: string, email: string): Promise<CreatedInvite>;
  /** `revoke_org_invite` as the signed-in teacher. */
  revoke(inviteId: string): Promise<RevokedInvite>;
  /** `sendWorkspaceInviteEmail`. The only place the token goes. */
  send(invite: WorkspaceInvite): Promise<WorkspaceInviteEmailResult>;
}

export interface ResendDeps extends InviteDeps {
  /** The invitation, read from the teacher's own workspace by id. */
  find(inviteId: string): Promise<FoundInvite>;
  /** The inviter's invitations since a moment, as `create_org_invite` counts them. */
  recentCount(inviterId: string, since: Date): Promise<number | null>;
  now(): Date;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/** One sentence for each refusal of `create_org_invite`. */
export const INVITE_REFUSAL_MESSAGES: Record<InviteRefusal, string> = {
  invalid_email: "Enter one email address for your colleague, like name@school.edu.",
  shared_workspace: "Inviting colleagues is not available in this workspace.",
  unconfirmed:
    "Confirm your own email address before you invite anyone. Open the link in the email LeaRN sent you, or ask for a new one from your item banks page.",
  already_member: "That address already belongs to a member of this workspace.",
  already_invited:
    "That address already has a pending invitation. Resend or revoke it in the list below.",
  members_full: `This workspace has ${WORKSPACE_MEMBER_CAP} members, the most it can hold.`,
  invites_full: `This workspace has ${WORKSPACE_PENDING_CAP} pending invitations, the most it can hold at once. Revoke one to send another.`,
  rate_limited: `You have sent ${WORKSPACE_DAILY_INVITES} invitations in the last 24 hours. Try again tomorrow.`,
};

export const INVITE_NOT_MADE = "The invitation could not be made just now. Try again in a moment.";

/** Why no email went out, and when trying again could work. */
const NOT_SENT: Record<
  Exclude<WorkspaceInviteEmailResult, "sent">,
  [why: string, retry: string]
> = {
  rate_limited: [
    `You have sent ${WORKSPACE_DAILY_INVITES} invitation emails today, so this one was not sent.`,
    "Try again tomorrow.",
  ],
  ceiling: [
    "LeaRN has sent as many invitation emails as it sends in an hour, so this one was not sent.",
    "Try again in an hour.",
  ],
  failed: ["The invitation email could not be sent.", "Try again in a moment."],
};

const NOTHING_PENDING = "No invitation is pending for that address.";
const LEFT_PENDING =
  "An invitation is still listed below with no email behind it. Revoke it before you try again.";

/** What the teacher reads when the email did not go out, by whether the invitation was undone. */
export function notSentMessage(
  result: Exclude<WorkspaceInviteEmailResult, "sent">,
  withdrawn: boolean,
): string {
  const [why, retry] = NOT_SENT[result] ?? NOT_SENT.failed;
  return `${why} ${withdrawn ? NOTHING_PENDING : LEFT_PENDING} ${retry}`;
}

export const INVITE_GONE = "That invitation is no longer pending. Reload the page to see the list.";
export const INVITE_ACCEPTED =
  "Your colleague has already accepted that invitation. Reload the page to see them in Members.";
export const REVOKE_FAILED = "Could not revoke the invitation. Try again.";
export const RESEND_FAILED = "Could not resend the invitation. Nothing was changed. Try again.";
export const RESEND_AT_LIMIT = `You have sent ${WORKSPACE_DAILY_INVITES} invitations in the last 24 hours, so this one was not resent. The earlier invitation is unchanged.`;
export const RESEND_BAD_ADDRESS =
  "That address cannot be emailed. Revoke the invitation and invite your colleague again.";
export const EARLIER_REVOKED = "The earlier invitation was revoked, and a new one was not sent.";

/**
 * A dependency that throws is a failure like any other. Only the error's name is logged: its
 * message could carry an address or the token.
 */
async function attempt<T>(step: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[workspace] ${step} threw`, {
      name: error instanceof Error ? error.name : "unknown",
    });
    return fallback;
  }
}

/**
 * Makes an invitation and emails it. If the email does not go out, the invitation just made is
 * revoked, so no address is left holding an invitation nobody was told about; if even that fails,
 * the sentence says the invitation is still listed.
 *
 * `email` has already passed `parseInviteAddress`.
 */
export async function sendInvitation(
  inviter: Inviter,
  email: string,
  deps: InviteDeps,
): Promise<InviteOutcome> {
  const created = await attempt<CreatedInvite>(
    "making an invitation",
    () => deps.create(inviter.id, email),
    { status: "failed" },
  );
  if (created.status === "failed") return { ok: false, message: INVITE_NOT_MADE };
  if (created.status !== "created") {
    return { ok: false, message: INVITE_REFUSAL_MESSAGES[created.status] };
  }

  const sent = await attempt<WorkspaceInviteEmailResult>(
    "sending an invitation",
    () =>
      deps.send({
        inviteId: created.inviteId,
        token: created.token,
        to: email,
        inviterId: inviter.id,
        inviterEmail: inviter.email,
        workspaceName: inviter.workspaceName,
      }),
    "failed",
  );
  if (sent === "sent") return { ok: true, email };

  const revoked = await attempt<RevokedInvite>(
    "withdrawing an unsent invitation",
    () => deps.revoke(created.inviteId),
    "failed",
  );
  return { ok: false, message: notSentMessage(sent, revoked === "revoked") };
}

/** Revokes one invitation. An id that is not one of the workspace's is simply not found. */
export async function revokeInvitation(
  inviteId: string,
  deps: Pick<InviteDeps, "revoke">,
): Promise<RevokeOutcome> {
  const revoked = await attempt<RevokedInvite>(
    "revoking an invitation",
    () => deps.revoke(inviteId),
    "failed",
  );
  if (revoked === "revoked") return { ok: true };
  if (revoked === "already_accepted") return { ok: false, message: INVITE_ACCEPTED };
  if (revoked === "not_found") return { ok: false, message: INVITE_GONE };
  return { ok: false, message: REVOKE_FAILED };
}

/**
 * Sends an invitation again. The database keeps only the token's hash, so the first link cannot
 * be mailed twice: the earlier invitation is revoked and a new one made for the same address,
 * which counts toward the inviter's five a day like any other.
 *
 * The count is read first. A teacher already at five would otherwise lose the invitation they
 * have and get nothing in its place; `create_org_invite` still has the last word.
 */
export async function resendInvitation(
  inviter: Inviter,
  inviteId: string,
  deps: ResendDeps,
): Promise<InviteOutcome> {
  const found = await attempt<FoundInvite>(
    "reading an invitation",
    () => deps.find(inviteId),
    "failed",
  );
  if (found === "failed") return { ok: false, message: RESEND_FAILED };
  if (found === "gone") return { ok: false, message: INVITE_GONE };
  if (found === "accepted") return { ok: false, message: INVITE_ACCEPTED };

  // The stored address is checked like a typed one before it is printed in another email.
  const address = parseInviteAddress(found.email);
  if (!address.ok) return { ok: false, message: RESEND_BAD_ADDRESS };

  const since = new Date(deps.now().getTime() - ONE_DAY);
  const recent = await attempt<number | null>(
    "counting invitations",
    () => deps.recentCount(inviter.id, since),
    null,
  );
  if (recent === null) return { ok: false, message: RESEND_FAILED };
  if (recent >= WORKSPACE_DAILY_INVITES) return { ok: false, message: RESEND_AT_LIMIT };

  const revoked = await attempt<RevokedInvite>(
    "revoking an invitation",
    () => deps.revoke(inviteId),
    "failed",
  );
  if (revoked === "already_accepted") return { ok: false, message: INVITE_ACCEPTED };
  if (revoked === "not_found") return { ok: false, message: INVITE_GONE };
  if (revoked !== "revoked") return { ok: false, message: RESEND_FAILED };

  const outcome = await sendInvitation(inviter, address.email, deps);
  if (outcome.ok) return outcome;
  return { ok: false, message: `${EARLIER_REVOKED} ${outcome.message}` };
}
