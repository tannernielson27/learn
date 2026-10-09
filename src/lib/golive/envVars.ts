/**
 * The environment variables a production deployment needs before real students arrive (#237).
 * `/api/health` reports each one as present or not (never its value), and `pnpm golive:check`
 * reads that report. Shared by both, so the list cannot drift between them.
 *
 * Each entry names the docs/05 section that sets it, so a failing line can say what to do.
 */
export const REQUIRED_ENV = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", docs: "§7.3 step 6" },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", docs: "§7.3 step 6" },
  { name: "SUPABASE_SECRET_KEY", docs: "§7.3 step 6" },
  { name: "SUPABASE_JWT_SIGNING_KEY", docs: "§7.3 step 6" },
  { name: "RESEND_API_KEY", docs: "§7.7 step 6" },
  { name: "EMAIL_FROM", docs: "§7.7 step 6" },
  { name: "SITE_URL", docs: "§7.7 step 6" },
  { name: "CRON_SECRET", docs: "§7.8 step 2" },
  { name: "SENTRY_DSN", docs: "§7.9 step 5" },
  { name: "NEXT_PUBLIC_SENTRY_DSN", docs: "§7.9 step 5" },
] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number]["name"];

/** The demo account's two variables; production must have neither before students (#115, #237). */
export const DEMO_ENV = ["DEMO_ACCOUNT_EMAIL", "DEMO_ACCOUNT_PASSWORD"] as const;

/**
 * How the sign-up CAPTCHA's two Turnstile variables stand on a deployment (#359, docs/05 §7.12).
 * - `on`: both are set. Whether Cloudflare accepts them is only seen by signing up.
 * - `skipped`: neither is set and this is not production, so sign-up asks for no CAPTCHA.
 * - `missing`: neither is set in production, which refuses every sign-up.
 * - `misconfigured`: one without the other, or the secret under a `NEXT_PUBLIC_` name; every
 *   sign-up is refused, on every deployment.
 */
export const SIGN_UP_CAPTCHA_STATES = ["on", "skipped", "missing", "misconfigured"] as const;

export type SignUpCaptcha = (typeof SIGN_UP_CAPTCHA_STATES)[number];

/** What anyone may read from `/api/health`: no per-variable detail, so nothing to aim at. */
export interface PublicHealth {
  supabase: "ok" | "unreachable" | "not_configured";
  /** The project ref, `local` or `unknown` (see src/lib/supabase/projectRef.ts). */
  project: string;
  /** The deployed commit, 12 hex characters; `local` off Vercel. */
  version: string;
  /**
   * Supabase answers, every required variable is present, the demo account is off, and sign-up is
   * not refused for want of the Turnstile keys.
   */
  ready: boolean;
}

/** What a caller holding `CRON_SECRET` also gets: booleans and one state, never a value. */
export interface DetailedHealth extends PublicHealth {
  env: Record<RequiredEnvName, boolean>;
  /** Either demo variable is set, which shows "Use the demo account" on /sign-in. */
  demoAccount: boolean;
  /** A deployment older than the line does not send it, which the check reads as a failure. */
  signUpCaptcha: SignUpCaptcha;
}
