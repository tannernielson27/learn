import { createSupabaseMemo, handleHealth, type SupabaseStatus } from "@/lib/golive/healthReport";
import { readSupabasePublicEnv } from "@/lib/supabase/env";
import { checkSupabaseHealth } from "@/lib/supabase/health";
import { supabaseProjectRef } from "@/lib/supabase/projectRef";

/** Supabase is asked at most once per window per server instance (see healthReport.ts). */
const SUPABASE_MEMO_MS = 5_000;

async function supabaseStatus(): Promise<SupabaseStatus> {
  try {
    return await checkSupabaseHealth(readSupabasePublicEnv());
  } catch {
    return {
      status: "not_configured",
      project: supabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
    };
  }
}

const supabase = createSupabaseMemo(supabaseStatus, SUPABASE_MEMO_MS);

/**
 * Each variable is read by name, so the NEXT_PUBLIC_ ones are the values this build carries. Only
 * whether each is set leaves this route (`summarizeEnv`); the values never do.
 */
function envSnapshot() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_JWT_SIGNING_KEY: process.env.SUPABASE_JWT_SIGNING_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    CRON_SECRET: process.env.CRON_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    DEMO_ACCOUNT_EMAIL: process.env.DEMO_ACCOUNT_EMAIL,
    DEMO_ACCOUNT_PASSWORD: process.env.DEMO_ACCOUNT_PASSWORD,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  };
}

/**
 * Whether this deployment can reach Supabase, which project that is (ADR 0006), which commit it
 * runs, and whether it is ready for students (#237). Per-variable booleans need
 * `Authorization: Bearer <CRON_SECRET>`; values never leave. See `handleHealth`.
 */
export async function GET(request: Request): Promise<Response> {
  return handleHealth(request, { env: envSnapshot(), supabase });
}
