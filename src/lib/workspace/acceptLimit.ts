import {
  clientIp,
  type RequestHeaders,
  type SignInRateLimitResult,
} from "@/lib/auth/signInRateLimit";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

/**
 * How often one caller may post to an invitation page: accepting, and making an account to accept
 * with. Twenty in five minutes. A department opening its invitations from one campus address
 * needs one post each, or a few after a mistyped password; a workspace holds ten people at most.
 *
 * `accept_org_invite` counts no misses of its own, and making an account is a write to Supabase
 * Auth, so this is what bounds both. The token lookup in front of each has its own per-caller
 * miss limit in the database (`resolve_org_invite`).
 */
export const INVITE_ACCEPT_LIMIT = {
  attempts: 20,
  windowMs: 5 * 60_000,
} as const satisfies RateLimit;

/** Says something about the network and nothing about the invitation. */
export const INVITE_ACCEPT_RATE_LIMITED =
  "Too many tries from this network. Wait a few minutes, then try again.";

/** The shared store could not answer: refused rather than let through uncounted. */
export const INVITE_ACCEPT_UNAVAILABLE =
  "Invitations are not working just now. Try again in a moment.";

/**
 * Counts one post from this request on the shared store and says whether to go on. The caller is
 * the address `clientIp` trusts, never a header of the caller's choosing. Off Vercel there is no
 * caller to key on, so nothing is counted, as for every other limiter here. Never throws, and
 * fails closed.
 */
export async function takeInviteAcceptAttempt(
  requestHeaders: RequestHeaders,
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<SignInRateLimitResult> {
  const ip = clientIp(requestHeaders);
  if (ip === null) return { ok: true };
  try {
    if (await store.hit("workspace_invite_accept", ip, INVITE_ACCEPT_LIMIT)) return { ok: true };
    return { ok: false, error: INVITE_ACCEPT_RATE_LIMITED };
  } catch (error) {
    console.error("[workspace-invite] the shared rate limiter could not answer an accept", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, error: INVITE_ACCEPT_UNAVAILABLE };
  }
}
