import type { Mailer } from "@/lib/email";
import { renderWorkspaceInviteEmail } from "@/lib/email/templates/workspaceInvite";
import {
  canonicalSiteOrigin,
  type DeploymentEnv,
  type RequestHeaders,
} from "@/lib/http/siteOrigin";
import type { InviteEmailAllowance } from "./inviteEmailLimit";

/** One invitation, as the server action holds it straight after making it. Plain values only. */
export interface WorkspaceInvite {
  /** The invitation's id. Not secret; it keys the send so a retry is not a second email. */
  inviteId: string;
  /** The raw token. It goes into the link and nowhere else: never a log, never a reply. */
  token: string;
  /** The invited address. */
  to: string;
  /** The inviter's account id, which the limits count. */
  inviterId: string;
  /** The inviter's own address, shown in the email. */
  inviterEmail: string;
  /** The workspace's name, shown in the email. */
  workspaceName: string;
}

/** What `sendWorkspaceInviteEmail` needs, injected so it can be tested. */
export interface WorkspaceInviteEmailDeps {
  /** The request the invitation was made from; only its origin is used. */
  requestHeaders: RequestHeaders;
  /** For tests; defaults to the deployment's own variables. */
  env?: DeploymentEnv;
  /** `getMailer()`. */
  mailer: Mailer;
  /** `takeWorkspaceInviteEmail`: the inviter's five a day, then the deployment's ceiling. */
  allow(inviterId: string): Promise<InviteEmailAllowance>;
}

/**
 * - `sent`: the mailer took it.
 * - `rate_limited`: the inviter has sent their five for the day.
 * - `ceiling`: the deployment has sent all it sends in an hour; try later.
 * - `failed`: the limiter could not answer, the mailer refused, or the link could not be made.
 *
 * On anything but `sent` no email went out, and the caller should revoke the invitation it has
 * just made so the address is not left with a pending invitation nobody was told about.
 */
export type WorkspaceInviteEmailResult = "sent" | "rate_limited" | "ceiling" | "failed";

/** A token is 32 base64url characters. Anything else is not put into a link. */
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

/** `/w/<token>` on `origin`: the page that shows the invitation and accepts it. */
export function workspaceInviteLink(origin: string, token: string): string {
  if (!TOKEN.test(token)) throw new Error("That is not an invitation token.");
  return new URL(`/w/${token}`, origin).toString();
}

function log(step: string, error: unknown): void {
  // Never an address, a workspace name or the token, and never an error's message, which could
  // carry any of them.
  const { code, status, kind, name } = (error ?? {}) as {
    code?: string;
    status?: number;
    kind?: string;
    name?: string;
  };
  console.error(`[workspace-invite] ${step} failed`, { name, kind, status, code });
}

/**
 * Emails an invitation to join a workspace, through the app mailer.
 *
 * Call it from the server action straight after `create_org_invite` answers `created`, with the
 * token that call returned. It takes plain values and reads no database: who may invite, and
 * whom, is decided before this.
 *
 * The link is on the site's canonical origin, never the one the request names. The send is keyed
 * on the invitation, so the same invitation is mailed at most once however often this is retried;
 * sending again is a new invitation. Never throws.
 */
export async function sendWorkspaceInviteEmail(
  invite: WorkspaceInvite,
  deps: WorkspaceInviteEmailDeps,
): Promise<WorkspaceInviteEmailResult> {
  try {
    const origin = canonicalSiteOrigin(deps.requestHeaders, deps.env);
    const link = workspaceInviteLink(origin, invite.token);
    const allowance = await deps.allow(invite.inviterId);
    if (allowance === "rate_limited" || allowance === "ceiling") return allowance;
    // Unanswered: already logged there.
    if (allowance !== "ok") return "failed";

    const email = renderWorkspaceInviteEmail({
      workspaceName: invite.workspaceName,
      inviterEmail: invite.inviterEmail,
      link,
    });
    await deps.mailer.send({
      to: invite.to,
      ...email,
      // From what it is about, never the address or the token.
      idempotencyKey: `workspace-invite:${invite.inviteId}`,
    });
    return "sent";
  } catch (error) {
    log("sending an invitation", error);
    return "failed";
  }
}
