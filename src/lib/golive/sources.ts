/**
 * How `pnpm golive:check` reads what it judges (#237). The network, the database and `gh` are
 * injected, so tests fake all three. Every query is one read-only SELECT (see sources.test.ts).
 */
import type { DetailedHealth, PublicHealth } from "./envVars.ts";
import {
  parseExposedSchemas,
  REMINDER_JOB,
  REMINDER_VAULT_NAMES,
  SWEEP_JOB,
  type HealthReading,
} from "./checks.ts";
import type { BackupRun, ReminderJobRow, SessionStateRow, SweepJobRow } from "./types.ts";

export type Row = Readonly<Record<string, unknown>>;
export type Query = (sql: string) => Promise<readonly Row[]>;
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
/** Runs `gh` with these arguments; resolves to stdout, rejects when gh fails or is missing. */
export type Gh = (args: readonly string[]) => Promise<string>;

const HTTP_TIMEOUT_MS = 15_000;

export const MIGRATIONS_SQL =
  "select version from supabase_migrations.schema_migrations order by version";

export const SESSION_STATE_SQL = `select
  to_regclass('live.session_public_state') is not null as table_exists,
  coalesce((select has_schema_privilege('anon', n.oid, 'usage') from pg_namespace n where n.nspname = 'live'), false) as anon_usage,
  coalesce(has_table_privilege('anon', to_regclass('live.session_public_state'), 'select'), false) as anon_select,
  coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('live.session_public_state')), false) as rls,
  exists (
    select 1 from pg_policies p
    where p.schemaname = 'live' and p.tablename = 'session_public_state'
      and p.cmd in ('SELECT', 'ALL') and p.permissive = 'PERMISSIVE'
      and p.roles && array['anon', 'public']::name[]
      and btrim(coalesce(p.qual, '')) = 'true'
  ) as open_policy`;

export const CRON_PRESENT_SQL = "select to_regclass('cron.job') is not null as has_cron";

export const CRON_JOB_SQL = `select count(*)::int as job_count, coalesce(bool_and(active), false) as job_active
  from cron.job where jobname = '${REMINDER_JOB}'`;

export const SWEEP_JOB_SQL = `select count(*)::int as job_count, coalesce(bool_and(active), false) as job_active
  from cron.job where jobname = '${SWEEP_JOB}'`;

export const VAULT_NAMES_SQL = `select case when to_regclass('vault.secrets') is null then 0 else (
  select count(distinct name)::int from vault.secrets
  where name in (${REMINDER_VAULT_NAMES.map((name) => `'${name}'`).join(", ")})
) end as vault_names`;

/** Every statement the check may send, for the read-only test. */
export const ALL_SQL = [
  MIGRATIONS_SQL,
  SESSION_STATE_SQL,
  CRON_PRESENT_SQL,
  CRON_JOB_SQL,
  VAULT_NAMES_SQL,
  SWEEP_JOB_SQL,
] as const;

/**
 * `supabase db query -o json` prints `{rows: [...]}` (or a bare array), sometimes after a line of
 * progress text. Anything else is an error rather than a guess.
 */
export function parseQueryRows(stdout: string): Row[] {
  const start = stdout.search(/[[{]/);
  if (start < 0) throw new Error("the query printed no JSON");
  const parsed: unknown = JSON.parse(stdout.slice(start));
  const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) throw new Error("the query printed no rows");
  return rows.filter((row): row is Row => typeof row === "object" && row !== null);
}

const bool = (value: unknown): boolean => value === true || value === "t" || value === "true";
const int = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

async function one(query: Query, sql: string): Promise<Row> {
  const rows = await query(sql);
  if (rows.length !== 1) throw new Error(`expected one row, got ${rows.length}`);
  return rows[0];
}

export async function readAppliedMigrations(query: Query): Promise<string[]> {
  const rows = await query(MIGRATIONS_SQL);
  return rows.map((row) => String(row.version));
}

export async function readSessionState(query: Query): Promise<SessionStateRow> {
  const row = await one(query, SESSION_STATE_SQL);
  return {
    table_exists: bool(row.table_exists),
    anon_usage: bool(row.anon_usage),
    anon_select: bool(row.anon_select),
    rls: bool(row.rls),
    open_policy: bool(row.open_policy),
  };
}

export async function readReminderJob(query: Query): Promise<ReminderJobRow> {
  const hasCron = bool((await one(query, CRON_PRESENT_SQL)).has_cron);
  const vaultNames = int((await one(query, VAULT_NAMES_SQL)).vault_names);
  if (!hasCron)
    return { has_cron: false, job_count: 0, job_active: false, vault_names: vaultNames };
  const job = await one(query, CRON_JOB_SQL);
  return {
    has_cron: true,
    job_count: int(job.job_count),
    job_active: bool(job.job_active),
    vault_names: vaultNames,
  };
}

/** cron.job does not exist until pg_cron is enabled, so it is only asked once pg_cron is there. */
export async function readSweepJob(query: Query): Promise<SweepJobRow> {
  const hasCron = bool((await one(query, CRON_PRESENT_SQL)).has_cron);
  if (!hasCron) return { has_cron: false, job_count: 0, job_active: false };
  const job = await one(query, SWEEP_JOB_SQL);
  return { has_cron: true, job_count: int(job.job_count), job_active: bool(job.job_active) };
}

/** The migration versions in the repo, from `supabase/migrations/<version>_<name>.sql` filenames. */
export function migrationVersions(filenames: readonly string[]): string[] {
  return filenames
    .map((name) => /^(\d{14})_[\w-]+\.sql$/.exec(name)?.[1])
    .filter((version): version is string => Boolean(version))
    .sort();
}

/** Asks PostgREST for a schema that cannot exist; its refusal names the exposed ones. */
export async function probeExposedSchemas(
  fetchImpl: FetchLike,
  supabaseUrl: string,
  publishableKey: string,
): Promise<string[] | null> {
  const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/`, {
    headers: { apikey: publishableKey, "Accept-Profile": "golive_probe_schema" },
    redirect: "error",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  return parseExposedSchemas(body);
}

function isPublicHealth(body: unknown): body is PublicHealth {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.supabase === "string" &&
    typeof b.project === "string" &&
    typeof b.version === "string" &&
    typeof b.ready === "boolean"
  );
}

function isDetailedHealth(body: PublicHealth): body is DetailedHealth {
  const b = body as unknown as Record<string, unknown>;
  const env = b.env;
  return (
    typeof b.demoAccount === "boolean" &&
    typeof env === "object" &&
    env !== null &&
    Object.values(env).every((value) => typeof value === "boolean")
  );
}

async function getHealth(fetchImpl: FetchLike, siteUrl: string, token: string | null) {
  const url = new URL("/api/health", siteUrl);
  // A fresh query string per call so no CDN copy of the public view answers the token.
  if (token) url.searchParams.set("detail", String(Date.now()));
  return fetchImpl(url.toString(), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    // Never follow a redirect: the token must not travel to another host, and a redirect here
    // means deployment protection or a wrong URL, which the owner should see.
    redirect: "manual",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
}

async function readBody(response: Response): Promise<PublicHealth | string> {
  if (response.status >= 300 && response.status < 400) {
    return `HTTP ${response.status}: the site redirected (deployment protection, or not the final URL)`;
  }
  const body: unknown = await response.json().catch(() => null);
  return isPublicHealth(body) ? body : `HTTP ${response.status}: not the health report`;
}

/** Reads `/api/health`, with the detailed view when a token is given. */
export async function readHealth(
  fetchImpl: FetchLike,
  siteUrl: string,
  token: string | null,
): Promise<HealthReading> {
  const first = await getHealth(fetchImpl, siteUrl, token);
  if (token && first.status === 401) {
    const body = await readBody(await getHealth(fetchImpl, siteUrl, null));
    return typeof body === "string"
      ? { kind: "unreadable", reason: body }
      : { kind: "public", body, tokenRefused: true };
  }
  const body = await readBody(first);
  if (typeof body === "string") return { kind: "unreadable", reason: body };
  if (token && isDetailedHealth(body)) return { kind: "detailed", body };
  return { kind: "public", body, tokenRefused: false };
}

const WORKFLOW = "db-backup.yml";

/** The newest successful backup run and its unexpired artifact names, or null when none. */
export async function readLatestBackup(gh: Gh): Promise<BackupRun | null> {
  const runs = JSON.parse(
    await gh([
      "run",
      "list",
      "--workflow",
      WORKFLOW,
      "--status",
      "success",
      "--limit",
      "1",
      "--json",
      "databaseId,createdAt",
    ]),
  ) as { databaseId?: unknown; createdAt?: unknown }[];
  const run = runs[0];
  if (!run || typeof run.createdAt !== "string" || !Number.isInteger(run.databaseId)) return null;
  const names = JSON.parse(
    await gh([
      "api",
      `repos/{owner}/{repo}/actions/runs/${run.databaseId}/artifacts`,
      "--jq",
      "[.artifacts[] | select(.expired | not) | .name]",
    ]),
  ) as unknown;
  const artifacts = Array.isArray(names)
    ? names.filter((n): n is string => typeof n === "string")
    : [];
  return { createdAt: run.createdAt, artifacts };
}
