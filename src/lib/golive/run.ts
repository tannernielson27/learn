/**
 * Runs every go-live check in order and never throws (#237): a check that cannot run is a failing
 * line (or a manual one, for GitHub) whose reason has any secret-looking text masked.
 */
import {
  backupCheck,
  exposedSchemasCheck,
  healthChecks,
  MANUAL_STEPS,
  migrationsCheck,
  reminderJobCheck,
  sessionStateCheck,
  type HealthReading,
} from "./checks.ts";
import {
  probeExposedSchemas,
  readAppliedMigrations,
  readHealth,
  readLatestBackup,
  readReminderJob,
  readSessionState,
  type FetchLike,
  type Gh,
  type Query,
} from "./sources.ts";
import type { CheckResult, CheckStatus } from "./types.ts";

export interface GoLiveOptions {
  siteUrl: string;
  /** What `/api/health` should report as its project: the hosted ref, or `local`. */
  expectedProject: string;
  supabaseUrl: string;
  /** For the exposed-schemas probe; null makes that line manual. */
  publishableKey: string | null;
  /** The deployment's CRON_SECRET, for the per-variable view; null reads the public view. */
  healthToken: string | null;
  /** Versions from `supabase/migrations`. */
  repoMigrations: readonly string[];
}

export interface GoLiveDeps {
  query: Query;
  fetch: FetchLike;
  gh: Gh;
  now: () => Date;
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /sb_(?:secret|publishable)_[\w-]+/g,
  /sbp_[\w-]+/g,
  /re_[A-Za-z0-9_]{8,}/g,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  /postgres(?:ql)?:\/\/\S+/g,
  /Bearer\s+\S+/gi,
  /(?:password|token|secret|key)=\S+/gi,
];

const MAX_REASON = 200;

/** The first line of an error, with anything that looks like a key, token or URL with a password masked. */
export function redact(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const firstLine = text.split(/\r?\n/).find((part) => part.trim()) ?? "unknown error";
  const masked = SECRET_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, "[redacted]"),
    firstLine,
  );
  return masked.length > MAX_REASON ? `${masked.slice(0, MAX_REASON)}...` : masked;
}

async function guarded(
  id: string,
  title: string,
  onError: CheckStatus,
  hint: string,
  run: () => Promise<CheckResult | CheckResult[]>,
): Promise<CheckResult[]> {
  try {
    const result = await run();
    return Array.isArray(result) ? result : [result];
  } catch (error) {
    const detail = [`could not check: ${redact(error)}.`, hint].filter(Boolean).join(" ");
    return [{ id, title, status: onError, detail }];
  }
}

const DB_HINT = "Is the stack running, or are you signed in (supabase login)?";

const SCHEMAS_TITLE = "the Data API exposes only public and graphql_public";

function schemasStep(options: GoLiveOptions, deps: GoLiveDeps): () => Promise<CheckResult[]> {
  const key = options.publishableKey;
  if (key === null) {
    const detail =
      "pass --publishable-key (the sb_publishable_ key, which is public) to check, or look in Project Settings > Data API";
    return async () => [{ id: "schemas", title: SCHEMAS_TITLE, status: "manual", detail }];
  }
  return () =>
    guarded("schemas", SCHEMAS_TITLE, "fail", "", async () =>
      exposedSchemasCheck(await probeExposedSchemas(deps.fetch, options.supabaseUrl, key)),
    );
}

/** One check at a time, in the order the report prints them: no burst of CLI processes. */
export async function runGoLiveCheck(
  options: GoLiveOptions,
  deps: GoLiveDeps,
): Promise<CheckResult[]> {
  const { query } = deps;
  const steps: readonly (() => Promise<CheckResult[]>)[] = [
    () =>
      guarded(
        "migrations",
        "migrations applied match supabase/migrations",
        "fail",
        DB_HINT,
        async () => migrationsCheck(options.repoMigrations, await readAppliedMigrations(query)),
      ),
    schemasStep(options, deps),
    () =>
      guarded(
        "anon-state",
        "anon cannot read every row of live.session_public_state",
        "fail",
        DB_HINT,
        async () => sessionStateCheck(await readSessionState(query)),
      ),
    async () => {
      // A site that cannot be reached still prints all three of its lines, each failing.
      const reading = await readHealth(deps.fetch, options.siteUrl, options.healthToken).catch(
        (error: unknown): HealthReading => ({ kind: "unreadable", reason: redact(error) }),
      );
      return healthChecks(reading, options.expectedProject);
    },
    () =>
      guarded("cron", "the reminder job is scheduled", "fail", DB_HINT, async () =>
        reminderJobCheck(await readReminderJob(query)),
      ),
    () =>
      guarded(
        "backup",
        "the backup workflow succeeded in the last 26 hours",
        "manual",
        "Check GitHub > Actions > db backup by hand, or run gh auth login (docs/05 §7.10).",
        async () => backupCheck(await readLatestBackup(deps.gh), deps.now()),
      ),
  ];
  const results: CheckResult[] = [];
  for (const step of steps) results.push(...(await step()));
  return [...results, ...MANUAL_STEPS];
}
