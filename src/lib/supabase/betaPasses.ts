import type { SupabaseClient } from "@supabase/supabase-js";
import { clipInviteToken } from "@/lib/classes/classes";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/** `redeem_beta_pass`'s one refusal, whatever the reason. */
const REFUSED = "PT403";

/**
 * - `redeemed`: the pass is used and the account's workspace has its grant.
 * - `refused`: anything else about the pass or the account. Nothing more is known, by design.
 * - `unavailable`: the database did not answer. Nothing is known about the pass.
 */
export type RedeemResult = "redeemed" | "refused" | "unavailable";

/**
 * Redeems a beta pass (#520) with the service-role client, the only role granted
 * `redeem_beta_pass`, for `userId`, which must be the account this request's session belongs to
 * as Supabase Auth verified it, never an id the request carried.
 */
export async function redeemBetaPass(
  service: Client,
  userId: string,
  token: string,
): Promise<RedeemResult> {
  const { error } = await service.rpc("redeem_beta_pass", {
    p_user: userId,
    p_token: clipInviteToken(token),
  });
  if (!error) return "redeemed";
  if (error.code === REFUSED) return "refused";
  // The code and nothing else: never the token, the account or the error's message.
  console.error("[free-access] redeeming failed", { code: error.code });
  return "unavailable";
}
