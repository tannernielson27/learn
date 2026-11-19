import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

/**
 * How often "Tell us about a problem" (#568) may email support@. Only a signed-in account can send
 * one, so the account is the key: no address is read, and nobody else can spend someone's budget.
 *
 * Five an hour per account: someone hitting one problem and then another, with a retry each, fits.
 * Two hundred a day for the whole deployment: a bad deploy that breaks a page for every class at once
 * still reaches support@ in plenty, and a script with many accounts cannot bury the inbox.
 */
export const PROBLEM_REPORT_LIMITS = {
  account: { attempts: 5, windowMs: 60 * 60_000 },
  total: { attempts: 200, windowMs: 24 * 60 * 60_000 },
} as const satisfies Record<"account" | "total", RateLimit>;

/** `ok` to send. Refusals say nothing more than which, so a message names the limit honestly. */
export type ProblemReportAllowance = "ok" | "rate_limited" | "unavailable";

export interface ProblemReportLimiter {
  take(userId: string): Promise<ProblemReportAllowance>;
}

/**
 * Counts the account first, so one account at its limit never spends the deployment's ceiling.
 * Fails closed: the mail would go through the same deployment, and an outage is no time to let a
 * flood through uncounted. The form then offers the support address instead.
 */
export function createProblemReportLimiter(
  store: RateLimitStore,
  limits: Readonly<Record<"account" | "total", RateLimit>> = PROBLEM_REPORT_LIMITS,
): ProblemReportLimiter {
  return {
    async take(userId) {
      try {
        if (!(await store.hit("problem_report", userId, limits.account))) return "rate_limited";
        if (await store.hit("problem_report_total", "deployment", limits.total)) return "ok";
        console.warn("[problem-report] the deployment's daily ceiling was reached");
        return "rate_limited";
      } catch (error) {
        console.error("[problem-report] the shared rate limiter could not answer", {
          error: error instanceof Error ? error.name : "unknown",
        });
        return "unavailable";
      }
    },
  };
}

let shared: ProblemReportLimiter | undefined;

/** The app's limiter, on the shared Postgres store. */
export function sharedProblemReportLimiter(): ProblemReportLimiter {
  return (shared ??= createProblemReportLimiter(sharedRateLimitStore()));
}
