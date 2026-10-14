import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

const ONE_HOUR = 60 * 60 * 1000;

/**
 * How many workspace invitation emails may be sent (owner decisions 2026-10-08):
 *
 * - **perInviter**: 5 a day for one person. The owner's number. An invitation mails an address
 *   its owner did not give LeaRN, so this is what one account can make LeaRN send to strangers.
 *   The window is a day from that person's first invitation, the longest the shared store counts.
 *   The database counts the same five on its own (`create_org_invite` answers `rate_limited`), so
 *   the limit holds whatever calls it; this one counts emails, and is what a resend spends.
 * - **deployment**: 50 an hour from everyone together, as the welcome email has its own ceiling
 *   (`WELCOME_EMAIL_CEILING`). Open sign-up means one person can make many teacher accounts, each
 *   with five a day; this is what they can send between them. Fifty is ten workspaces inviting a
 *   full day's worth in the same hour, and half of what Resend's free plan allows in a day.
 */
export const WORKSPACE_INVITE_EMAIL_LIMITS = {
  perInviter: { attempts: 5, windowMs: 24 * ONE_HOUR },
  deployment: { attempts: 50, windowMs: ONE_HOUR },
} as const satisfies Record<string, RateLimit>;

/**
 * - `ok`: send it.
 * - `rate_limited`: this inviter has sent their five for the day.
 * - `ceiling`: the deployment has sent its fifty for the hour. Nothing about this inviter.
 * - `unavailable`: the shared store could not answer. Refused rather than sent uncounted.
 */
export type InviteEmailAllowance = "ok" | "rate_limited" | "ceiling" | "unavailable";

/**
 * Counts one invitation email against the inviter's day and then the deployment's hour, and
 * answers whether to send it. The inviter is counted first, so a person past their own five never
 * spends the ceiling everybody shares. Never throws, and fails closed.
 *
 * `inviterId` is the account's id, never its address; the store keeps only a keyed digest of it.
 */
export async function takeWorkspaceInviteEmail(
  inviterId: string,
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<InviteEmailAllowance> {
  try {
    const { perInviter, deployment } = WORKSPACE_INVITE_EMAIL_LIMITS;
    if (!(await store.hit("workspace_invite_inviter", inviterId, perInviter))) {
      return "rate_limited";
    }
    if (!(await store.hit("workspace_invite_email", "deployment", deployment))) {
      console.warn("[workspace-invite] the deployment's invitation email ceiling was reached");
      return "ceiling";
    }
    return "ok";
  } catch (error) {
    console.error(
      "[workspace-invite] the shared rate limiter could not answer, so nothing was sent",
      { error: error instanceof Error ? error.name : "unknown" },
    );
    return "unavailable";
  }
}
