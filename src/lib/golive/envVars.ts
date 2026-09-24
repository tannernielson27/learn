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
  { name: "CRON_SECRET", docs: "§7.8 step 2" },
  { name: "SENTRY_DSN", docs: "§7.9 step 5" },
  { name: "NEXT_PUBLIC_SENTRY_DSN", docs: "§7.9 step 5" },
] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number]["name"];

/** The demo account's two variables; production must have neither before students (#115, #237). */
export const DEMO_ENV = ["DEMO_ACCOUNT_EMAIL", "DEMO_ACCOUNT_PASSWORD"] as const;

/** What anyone may read from `/api/health`: no per-variable detail, so nothing to aim at. */
export interface PublicHealth {
  supabase: "ok" | "unreachable" | "not_configured";
  /** The project ref, `local` or `unknown` (see src/lib/supabase/projectRef.ts). */
  project: string;
  /** The deployed commit, 12 hex characters; `local` off Vercel. */
  version: string;
  /** Supabase answers, every required variable is present, and the demo account is off. */
  ready: boolean;
}

/** What a caller holding `CRON_SECRET` also gets: booleans only, never a value. */
export interface DetailedHealth extends PublicHealth {
  env: Record<RequiredEnvName, boolean>;
  /** Either demo variable is set, which shows "Use the demo account" on /sign-in. */
  demoAccount: boolean;
}
