import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import { clientIp, type RequestHeaders } from "./signInRateLimit";

/**
 * How many class codes one calling address may try in five minutes, whoever is signed in.
 *
 * `join_class_by_code` counts tries per account (sixty per five minutes), because the account is
 * the only key the database cannot be lied to about. Open sign-up (ADR 0009) makes accounts cheap,
 * so on its own that bounds nothing: every new account is a fresh sixty. The server action can
 * read the address the request came from, which the database cannot, so this counts there, in
 * front of the database's count and on the shared store sign-up uses (#234).
 *
 * 120: a class told to "type the code on the board" arrives from one campus address (the lesson of
 * #217), so this must admit a room. Sixty students with a retry each fit; the same reasoning as
 * `SIGN_IN_INVITE_LIMIT`. One address then gets about 35,000 tries a day at 8.5e11 codes, however
 * many accounts it makes, where before it got 17,000 a day for each account.
 *
 * What it does not do: someone with many addresses still gets a budget for each. That is the
 * residue the per-account count, the sign-up CAPTCHA and the sign-up limit (#359) are there for.
 * And it can refuse a real student: a caller who spends an address's budget keeps everyone behind
 * that address from typing a code for the rest of the window. The invite link and its QR code do
 * not pass through here, so a class is never without a way in.
 *
 * Off Vercel there is no caller to key on (`clientIp`), so nothing is counted, as for every other
 * per-caller limit here; local runs and e2e are not locked out by their own address.
 */
export const CLASS_CODE_LIMIT = {
  attempts: 120,
  windowMs: 5 * 60_000,
} as const satisfies RateLimit;

/**
 * `ok` to go on to the database. Neither refusal says anything about the code that was typed: the
 * try is counted before any class is looked up, and counted the same whatever the code is.
 */
export type ClassCodeAttempt = "ok" | "rate_limited" | "unavailable";

export interface ClassCodeLimiter {
  /** Counts one try against the calling address and says whether to go on. */
  take(ip: string | null): Promise<ClassCodeAttempt>;
}

/**
 * The class code counter, on the shared store. Fails closed, as sign-in and sign-up do: the join
 * itself runs on the same database, so a store that cannot answer usually means the join could not
 * have either, and letting tries through uncounted is how guessing would get past an outage.
 */
export function createClassCodeLimiter(
  store: RateLimitStore,
  limit: Readonly<RateLimit> = CLASS_CODE_LIMIT,
): ClassCodeLimiter {
  let refusals = 0;
  return {
    async take(ip) {
      if (ip === null) return "ok";
      try {
        if (await store.hit("class_code", ip, limit)) return "ok";
        refusals += 1;
        // A total, never the address: enough for an operator to see that someone is guessing.
        console.warn("[class-code] an address reached the class code limit", { refusals });
        return "rate_limited";
      } catch (error) {
        console.error("[class-code] the shared rate limiter could not answer a class code try", {
          error: error instanceof Error ? error.name : "unknown",
        });
        return "unavailable";
      }
    },
  };
}

let sharedLimiter: ClassCodeLimiter | undefined;

/**
 * Counts one class code try from this request's address, on the Postgres store:
 *
 *   const allowed = await takeClassCodeAttempt(await headers());
 *   if (allowed !== "ok") return ...;
 *
 * Call it once the code has the right shape and before `joinClassByCode`, so a refused address
 * costs no lookup and spends nothing of the account's own budget. It never throws.
 */
export function takeClassCodeAttempt(
  requestHeaders: RequestHeaders,
  limiter: ClassCodeLimiter = (sharedLimiter ??= createClassCodeLimiter(sharedRateLimitStore())),
): Promise<ClassCodeAttempt> {
  return limiter.take(clientIp(requestHeaders));
}
