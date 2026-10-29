import type { RedeemResult } from "@/lib/supabase/betaPasses";
import { BETA_PASS_RATE_LIMITED, BETA_PASS_UNAVAILABLE, type RedeemState } from "./link";
import type { RedeemAttempt } from "./redeemLimit";

/** The calls `redeemAsSignedIn` makes, injected so it can be tested. */
export interface RedeemDeps {
  /** `takeBetaPassAttempt` for this request. */
  allow(): Promise<RedeemAttempt>;
  /** The account this request's session belongs to, verified by Supabase Auth, or null. */
  currentUser(): Promise<string | null>;
  /** `redeemBetaPass` with the service-role client. */
  redeem(userId: string, token: string): Promise<RedeemResult>;
}

export type RedeemOutcome = { status: "redeemed" } | { status: "signed_out" } | RedeemState;

/**
 * "Accept" on `/b/<token>` (#520): the network's budget first, so a refusal there is the same for
 * every link; then the signed-in account, asked of Supabase Auth; then the database, which checks
 * everything about the pass and the account and answers only yes or no.
 */
export async function redeemAsSignedIn(token: string, deps: RedeemDeps): Promise<RedeemOutcome> {
  const allowed = await deps.allow();
  if (!allowed.ok) {
    return {
      status: "error",
      error: allowed.reason === "rate_limited" ? BETA_PASS_RATE_LIMITED : BETA_PASS_UNAVAILABLE,
    };
  }

  const userId = await deps.currentUser();
  if (!userId) return { status: "signed_out" };

  const result = await deps.redeem(userId, token);
  if (result === "redeemed") return { status: "redeemed" };
  if (result === "refused") return { status: "unusable" };
  return { status: "error", error: BETA_PASS_UNAVAILABLE };
}
