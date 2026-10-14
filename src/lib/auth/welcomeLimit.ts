import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

/**
 * How many welcome emails (#360) this deployment sends in an hour, from every caller together.
 *
 * The confirmation email used to be a Supabase Auth email, so Supabase's own "Rate limit for
 * sending emails" (150 an hour in production, docs/05 §7.7 step 4) capped it on top of the app's
 * per-caller and per-address limits. The welcome email goes through the app mailer instead, so
 * that ceiling no longer applies to it; this is the same number, kept by the app. A whole class
 * joining at once fits; someone holding an invite link and many addresses does not get further.
 */
export const WELCOME_EMAIL_CEILING = {
  attempts: 150,
  windowMs: 60 * 60 * 1000,
} as const satisfies RateLimit;

/**
 * Counts one welcome email against the deployment's ceiling, and answers whether to send it.
 * Fails closed: when the store cannot answer, nothing is sent. Neither answer blocks a sign-up,
 * and the banner on the student home offers to send it again.
 */
export async function takeWelcomeEmail(
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<boolean> {
  try {
    const allowed = await store.hit("welcome_email", "deployment", WELCOME_EMAIL_CEILING);
    if (!allowed) console.warn("[welcome] the deployment's welcome email ceiling was reached");
    return allowed;
  } catch (error) {
    console.error("[welcome] the shared rate limiter could not answer, so nothing was sent", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}
