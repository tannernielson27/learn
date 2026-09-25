/**
 * The judgements behind `pnpm golive:check` (#237). Each takes what was read and returns one line;
 * nothing here touches the network, so every pass and fail path is a plain unit test.
 */
import { REQUIRED_ENV, type DetailedHealth, type PublicHealth } from "./envVars.ts";
import type {
  BackupRun,
  CheckResult,
  CheckStatus,
  ReminderJobRow,
  SessionStateRow,
  SweepJobRow,
} from "./types.ts";

/** The schemas the audit (docs/audits/S10-security.md) assumes the Data API exposes, and no more. */
export const ALLOWED_SCHEMAS = ["public", "graphql_public"] as const;

/** The job name docs/05 §7.8 step 4 schedules. */
export const REMINDER_JOB = "learn-assignment-reminders";

/** The two Vault names the job reads (§7.8 step 4). */
export const REMINDER_VAULT_NAMES = ["learn_reminders_url", "learn_cron_secret"] as const;

/** The job migration 20260925050000 (or `private.schedule_rate_limit_sweep()`) schedules (#248). */
export const SWEEP_JOB = "learn-rate-limit-sweep";

/** The backup runs nightly; 26 hours allows for a late start without hiding a missed night. */
export const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;

const line = (id: string, title: string, status: CheckStatus, detail: string): CheckResult => ({
  id,
  title,
  status,
  detail,
});

const listed = (names: readonly string[], max = 5): string =>
  names.length <= max
    ? names.join(", ")
    : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;

export function migrationsCheck(repo: readonly string[], applied: readonly string[]): CheckResult {
  const title = "migrations applied match supabase/migrations (docs/05 §7.2)";
  const appliedSet = new Set(applied);
  const repoSet = new Set(repo);
  const missing = repo.filter((version) => !appliedSet.has(version));
  const extra = applied.filter((version) => !repoSet.has(version));
  if (repo.length === 0)
    return line("migrations", title, "fail", "no migrations found in the repo");
  if (missing.length === 0 && extra.length === 0) {
    return line("migrations", title, "pass", `all ${repo.length} applied`);
  }
  const parts = [
    missing.length ? `not applied: ${listed(missing)} (run supabase db push, §7.3 step 3)` : "",
    extra.length ? `applied but not in the repo: ${listed(extra)} (§7.4)` : "",
  ].filter(Boolean);
  return line("migrations", title, "fail", parts.join("; "));
}

/**
 * PostgREST answers an unknown `Accept-Profile` with PGRST106, naming the exposed schemas in its
 * hint (v12+) or its message (older). Returns null when the answer is not that error.
 */
export function parseExposedSchemas(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const { code, hint, message } = body as Record<string, unknown>;
  if (code !== "PGRST106") return null;
  for (const text of [hint, message]) {
    if (typeof text !== "string") continue;
    const match = /(?:exposed|one of the following)\s*:\s*(.+)$/i.exec(text.trim());
    if (match) {
      return match[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    }
  }
  return null;
}

export function exposedSchemasCheck(schemas: readonly string[] | null): CheckResult {
  const title = "the Data API exposes only public and graphql_public (live and private stay off)";
  if (schemas === null) {
    return line(
      "schemas",
      title,
      "fail",
      "PostgREST did not name its exposed schemas; check Project Settings > Data API by hand",
    );
  }
  const allowed = new Set<string>(ALLOWED_SCHEMAS);
  const extra = schemas.filter((name) => !allowed.has(name));
  if (extra.length === 0) return line("schemas", title, "pass", `exposed: ${schemas.join(", ")}`);
  return line(
    "schemas",
    title,
    "fail",
    `also exposed: ${extra.join(", ")}. Remove them in Project Settings > Data API > Exposed schemas (§7.3 step 8)`,
  );
}

export function sessionStateCheck(row: SessionStateRow): CheckResult {
  const title = "anon cannot read every row of live.session_public_state (#178)";
  if (!row.table_exists) return line("anon-state", title, "pass", "the table does not exist");
  const reachable = row.anon_usage && row.anon_select;
  if (!reachable) return line("anon-state", title, "pass", "anon has no select on it");
  if (!row.rls) {
    return line("anon-state", title, "fail", "row level security is off on the table");
  }
  if (row.open_policy) {
    return line(
      "anon-state",
      title,
      "fail",
      "a select policy with `using (true)` still applies to anon. Turn off Realtime " +
        '"Allow public access" (§7.3 step 8), then merge and apply #178',
    );
  }
  return line("anon-state", title, "pass", "only narrow policies apply to anon");
}

export function reminderJobCheck(row: ReminderJobRow): CheckResult {
  const title = `the reminder job ${REMINDER_JOB} is scheduled (docs/05 §7.8)`;
  if (!row.has_cron) {
    return line("cron", title, "fail", "pg_cron is not enabled (§7.8 step 3)");
  }
  if (row.job_count === 0) {
    return line("cron", title, "fail", "no job by that name (§7.8 step 4)");
  }
  if (!row.job_active) return line("cron", title, "fail", "the job exists but is inactive (§7.8)");
  if (row.vault_names < REMINDER_VAULT_NAMES.length) {
    return line(
      "cron",
      title,
      "fail",
      `the job exists but Vault lacks ${REMINDER_VAULT_NAMES.join(" or ")} (§7.8 step 4)`,
    );
  }
  return line("cron", title, "pass", "scheduled, active, and its Vault secrets exist");
}

const SCHEDULE_SWEEP = "select private.schedule_rate_limit_sweep();";

export function sweepJobCheck(row: SweepJobRow): CheckResult {
  const title = `the rate-limit sweep job ${SWEEP_JOB} is scheduled (#248, docs/05 §7.8)`;
  const fail = (detail: string) => line("rate-limit-sweep", title, "fail", detail);
  if (!row.has_cron) {
    return fail(
      `pg_cron is not enabled (§7.8 step 3); then run ${SCHEDULE_SWEEP} in the SQL editor (§7.8 step 4)`,
    );
  }
  if (row.job_count === 0) {
    return fail(`no job by that name; run ${SCHEDULE_SWEEP} in the SQL editor (§7.8 step 4)`);
  }
  if (row.job_count > 1) {
    return fail(
      `${row.job_count} jobs by that name; unschedule the extras by jobid, keep one (§7.8)`,
    );
  }
  if (!row.job_active) {
    return fail(`the job exists but is inactive; ${SCHEDULE_SWEEP} switches it back on (§7.8)`);
  }
  return line("rate-limit-sweep", title, "pass", "scheduled every five minutes, and active");
}

export function backupCheck(run: BackupRun | null, now: Date): CheckResult {
  const title = "the backup workflow succeeded in the last 26 hours (docs/05 §7.10)";
  if (!run) {
    return line("backup", title, "fail", "no successful run of db-backup.yml (§7.10 steps 2-3)");
  }
  const age = now.getTime() - Date.parse(run.createdAt);
  if (!Number.isFinite(age) || age > BACKUP_MAX_AGE_MS) {
    return line("backup", title, "fail", `the newest success started ${run.createdAt} (§7.10)`);
  }
  // Until both secrets are set the workflow stays green and uploads nothing (§7.10 step 2).
  if (!run.artifacts.some((name) => name.startsWith("db-backup-"))) {
    return line(
      "backup",
      title,
      "fail",
      "the newest run uploaded no backup; set BACKUP_AGE_RECIPIENT and PROD_DB_URL (§7.10 step 2)",
    );
  }
  return line("backup", title, "pass", `newest backup started ${run.createdAt}`);
}

/** What the site's `/api/health` said, or why it could not be read. */
export type HealthReading =
  | { kind: "public"; body: PublicHealth; tokenRefused: boolean }
  | { kind: "detailed"; body: DetailedHealth }
  | { kind: "unreadable"; reason: string };

export function healthChecks(reading: HealthReading, expectedProject: string): CheckResult[] {
  if (reading.kind === "unreadable") {
    const reason = `${reading.reason} (§7.3 step 7)`;
    return [
      line("site", "the site's /api/health answers", "fail", reason),
      line("env", "every required variable is set on the site", "fail", "health unreadable"),
      line("demo", "the demo account is off", "fail", "health unreadable"),
    ];
  }
  const { body } = reading;
  return [siteCheck(body, expectedProject), envCheck(reading), demoCheck(reading)];
}

function siteCheck(body: PublicHealth, expectedProject: string): CheckResult {
  const title = "the site reaches the Supabase project being checked";
  const version = `version ${body.version}`;
  if (body.supabase !== "ok") {
    return line("site", title, "fail", `supabase: ${body.supabase}, ${version} (§7.3 steps 6-7)`);
  }
  if (body.project !== expectedProject) {
    return line(
      "site",
      title,
      "fail",
      `the site uses ${body.project}, not ${expectedProject} (§7.3 step 6)`,
    );
  }
  return line("site", title, "pass", `project ${body.project}, ${version}`);
}

const TOKEN_HINT =
  "set GOLIVE_HEALTH_TOKEN to the deployment's CRON_SECRET to see which (see docs/05 Go-live)";

function envCheck(reading: Exclude<HealthReading, { kind: "unreadable" }>): CheckResult {
  const title = "every required variable is set on the site (values are never read)";
  if (reading.kind === "detailed") {
    const missing = REQUIRED_ENV.filter(({ name }) => reading.body.env[name] !== true);
    if (missing.length === 0) return line("env", title, "pass", `all ${REQUIRED_ENV.length} set`);
    const names = missing.map(({ name, docs }) => `${name} (${docs})`);
    return line("env", title, "fail", `missing: ${names.join(", ")}`);
  }
  if (reading.tokenRefused) {
    return line(
      "env",
      title,
      "fail",
      "the site refused GOLIVE_HEALTH_TOKEN; it must equal CRON_SECRET",
    );
  }
  if (reading.body.ready) return line("env", title, "pass", "the site reports ready");
  return line("env", title, "fail", `the site reports not ready; ${TOKEN_HINT}`);
}

function demoCheck(reading: Exclude<HealthReading, { kind: "unreadable" }>): CheckResult {
  const title = "the demo account is off (DEMO_ACCOUNT_* unset)";
  const fix =
    "delete DEMO_ACCOUNT_EMAIL and DEMO_ACCOUNT_PASSWORD from Vercel Production, redeploy";
  if (reading.kind === "detailed") {
    return reading.body.demoAccount
      ? line("demo", title, "fail", `the demo account is on; ${fix}`)
      : line("demo", title, "pass", "neither variable is set");
  }
  if (reading.body.ready) return line("demo", title, "pass", "the site reports ready");
  return line("demo", title, "manual", `cannot tell without the token; ${TOKEN_HINT}`);
}

/** What no script can see: each names the docs/05 step that settles it. */
export const MANUAL_STEPS: readonly CheckResult[] = [
  line(
    "realtime",
    'Realtime "Allow public access" is off',
    "manual",
    "Supabase > Realtime > Settings (docs/05 §7.3 step 8)",
  ),
  line(
    "smtp",
    "Auth sends through Resend SMTP with the LeaRN template and a raised rate limit",
    "manual",
    "Supabase > Authentication > Emails and Rate Limits (docs/05 §7.7 steps 1-4, 7)",
  ),
  line(
    "auth-urls",
    "Auth Site URL and redirect URLs name the production site",
    "manual",
    "Supabase > Authentication > URL Configuration (docs/05 §7.7 step 5)",
  ),
  line(
    "sentry",
    "Sentry receives a scrubbed test error and has its alert rules",
    "manual",
    "docs/05 §7.9 steps 2, 6-7",
  ),
];
