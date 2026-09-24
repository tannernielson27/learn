/** One line of `pnpm golive:check` (#237). */
export type CheckStatus = "pass" | "fail" | "manual";

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  /** What was found, and for a fail or a manual step, the docs/05 section that fixes it. */
  detail: string;
}

/** Everything the check reads from the database, in the shape its read-only SELECTs return. */
export interface SessionStateRow {
  table_exists: boolean;
  anon_usage: boolean;
  anon_select: boolean;
  rls: boolean;
  open_policy: boolean;
}

export interface ReminderJobRow {
  has_cron: boolean;
  job_count: number;
  job_active: boolean;
  vault_names: number;
}

/** The newest successful run of `.github/workflows/db-backup.yml`, with its artifact names. */
export interface BackupRun {
  createdAt: string;
  artifacts: readonly string[];
}
