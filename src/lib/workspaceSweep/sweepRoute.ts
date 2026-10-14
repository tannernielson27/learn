/**
 * `POST /api/cron/workspace-sweep` (ADR 0012). pg_cron calls it once a day through pg_net with
 * `Authorization: Bearer <CRON_SECRET>`, the way it calls the reminder route (ADR 0007).
 *
 * One run asks the database which abandoned self-registered workspaces there are
 * (`public.sweep_abandoned_workspaces`, migration 20261012000000) and, only when the deployment's
 * `WORKSPACE_SWEEP` variable is exactly `delete`, has it delete them. Anything else, the variable
 * unset included, is a dry run: the database reports and changes nothing. Which workspaces, and
 * what a deletion removes, is decided in that function and nowhere here.
 *
 * Nothing in the request chooses anything: not the mode, not the limit. The reply is counts only.
 * Each run writes one log line with the counts and the workspaces' ids, never a name or an
 * address. The secret and the two limits work as on the reminder route (`cronRoute.ts`).
 */
import { clientIp } from "@/lib/auth/signInRateLimit";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import {
  CRON_LIMITS,
  MIN_SECRET_LENGTH,
  bearerMatches,
  type CronLimiter,
} from "@/lib/reminders/cronRoute";

/** The most workspaces one run deletes, or reports it would. The database caps it at 100. */
export const SWEEP_LIMIT = 20;

/** The one value of `WORKSPACE_SWEEP` that deletes. */
export const SWEEP_DELETE_VALUE = "delete";

export type SweepMode = "delete" | "dry_run";

/** Exactly `delete`, with no trimming and no other spelling; everything else is a dry run. */
export function sweepMode(value: string | undefined): SweepMode {
  return value === SWEEP_DELETE_VALUE ? "delete" : "dry_run";
}

/** One row of `public.sweep_abandoned_workspaces`. */
export interface SweepRow {
  orgId: string;
  rule: string;
  outcome: string;
  reason: string | null;
}

/** `not_available`: the database has no such function yet (the migration is not applied). */
export type SweepResult = { status: "ok"; rows: SweepRow[] } | { status: "not_available" };

export type SweepLog = (
  level: "info" | "error",
  message: string,
  details: Record<string, unknown>,
) => void;

export interface WorkspaceSweepDeps {
  /** CRON_SECRET. */
  secret: string | undefined;
  /** WORKSPACE_SWEEP, as set. */
  mode: string | undefined;
  /** Calls the database function with the service role. Rejects when the call fails. */
  sweep: (options: { delete: boolean; limit: number }) => Promise<SweepResult>;
  limiter: CronLimiter;
  log?: SweepLog;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** pg_cron runs it once a day; an owner checking by hand needs a few more. */
export const SWEEP_LIMITS = {
  denied: CRON_LIMITS.denied,
  runs: { attempts: 6, windowMs: 60 * 60_000 },
} as const satisfies Record<"denied" | "runs", RateLimit>;

/** Wrong secrets share the reminder route's per-caller budget; runs are counted on their own. */
export function createSweepLimiter(
  store: RateLimitStore,
  limits: Readonly<Record<"denied" | "runs", RateLimit>> = SWEEP_LIMITS,
): CronLimiter {
  return {
    takeDenied: (caller) => store.hit("cron_denied", caller, limits.denied),
    takeRun: () => store.hit("cron_runs", "workspace_sweep", limits.runs),
  };
}

export const SWEEP_RULES = ["memberless", "never_used"] as const;
export const SWEEP_OUTCOMES = ["would_delete", "deleted", "skipped"] as const;
export type SweepRule = (typeof SWEEP_RULES)[number];
export type SweepOutcome = (typeof SWEEP_OUTCOMES)[number];
export type SweepCounts = Record<SweepRule, Record<SweepOutcome, number>>;

export interface SweepSummary {
  counts: SweepCounts;
  wouldDelete: string[];
  deleted: string[];
  skipped: { org: string; rule: SweepRule; reason: string }[];
  /** Rows whose id, rule or outcome was not one this code knows. Counted, never quoted. */
  unrecognised: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A skip reason is a lower-case word, or `error_` and a five-character SQLSTATE. */
const REASON = /^(?:[a-z_]{1,40}|error_[0-9A-Z]{5})$/;

function isRule(value: string): value is SweepRule {
  return (SWEEP_RULES as readonly string[]).includes(value);
}

function isOutcome(value: string): value is SweepOutcome {
  return (SWEEP_OUTCOMES as readonly string[]).includes(value);
}

function emptyCounts(): SweepCounts {
  return {
    memberless: { would_delete: 0, deleted: 0, skipped: 0 },
    never_used: { would_delete: 0, deleted: 0, skipped: 0 },
  };
}

/**
 * Counts by rule and outcome, and the ids behind them. The database sends ids and fixed words
 * only; anything else is dropped here rather than trusted, so no text of unknown origin can
 * reach a log.
 */
export function summarize(rows: readonly SweepRow[]): SweepSummary {
  const summary: SweepSummary = {
    counts: emptyCounts(),
    wouldDelete: [],
    deleted: [],
    skipped: [],
    unrecognised: 0,
  };
  for (const row of rows) {
    if (!UUID.test(row.orgId) || !isRule(row.rule) || !isOutcome(row.outcome)) {
      summary.unrecognised += 1;
      continue;
    }
    summary.counts[row.rule][row.outcome] += 1;
    if (row.outcome === "would_delete") summary.wouldDelete.push(row.orgId);
    else if (row.outcome === "deleted") summary.deleted.push(row.orgId);
    else {
      const reason = row.reason !== null && REASON.test(row.reason) ? row.reason : "unknown";
      summary.skipped.push({ org: row.orgId, rule: row.rule, reason });
    }
  }
  return summary;
}

function reply(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function failure(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
}

const consoleLog: SweepLog = (level, message, details) => {
  if (level === "error") console.error(message, details);
  else console.info(message, details);
};

/** A wrong secret is refused either way; the limit only turns 401 into 429 for a guesser. */
async function refuseWrongSecret(
  request: Request,
  limiter: CronLimiter,
  log: SweepLog,
): Promise<Response> {
  const caller = clientIp(request.headers) ?? "local";
  try {
    if (!(await limiter.takeDenied(caller))) return reply({ error: "rate_limited" }, 429);
  } catch (error) {
    log("error", "[workspace-sweep] the shared rate limiter could not answer", {
      error: failure(error),
    });
  }
  return reply({ error: "unauthorized" }, 401);
}

/** An authorised run that cannot be counted does not run (fails closed), as on the reminders. */
async function countRun(limiter: CronLimiter, log: SweepLog): Promise<"allowed" | Response> {
  try {
    return (await limiter.takeRun()) ? "allowed" : reply({ error: "rate_limited" }, 429);
  } catch (error) {
    log("error", "[workspace-sweep] the shared rate limiter could not answer", {
      error: failure(error),
    });
    return reply({ error: "rate_limit_unavailable" }, 503);
  }
}

async function run(mode: SweepMode, deps: WorkspaceSweepDeps, log: SweepLog): Promise<Response> {
  let result: SweepResult;
  try {
    result = await deps.sweep({ delete: mode === "delete", limit: SWEEP_LIMIT });
  } catch (error) {
    // The store's error names the function and the Postgres code; an address is masked anyway.
    log("error", "[workspace-sweep] the run failed", {
      mode,
      error: error instanceof Error ? error.name : "unknown",
      detail:
        error instanceof Error ? error.message.slice(0, 120).replace(/\S+@\S+/g, "[address]") : "",
    });
    return reply({ error: "failed" }, 500);
  }

  if (result.status === "not_available") {
    log("info", "[workspace-sweep] not available", { mode });
    return reply({ status: "not_available", mode });
  }

  const summary = summarize(result.rows);
  log("info", "[workspace-sweep] run", {
    mode,
    limit: SWEEP_LIMIT,
    counts: summary.counts,
    wouldDelete: summary.wouldDelete,
    deleted: summary.deleted,
    skipped: summary.skipped,
    ...(summary.unrecognised > 0 ? { unrecognised: summary.unrecognised } : {}),
  });
  return reply({ status: "ok", mode, counts: summary.counts });
}

export async function handleWorkspaceSweep(
  request: Request,
  deps: WorkspaceSweepDeps,
): Promise<Response> {
  const log = deps.log ?? consoleLog;
  const secret = deps.secret?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    log("error", "[workspace-sweep] CRON_SECRET is not set, or is too short", {
      minLength: MIN_SECRET_LENGTH,
    });
    return reply({ error: "not_configured" }, 503);
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return refuseWrongSecret(request, deps.limiter, log);
  }
  const counted = await countRun(deps.limiter, log);
  if (counted !== "allowed") return counted;

  return run(sweepMode(deps.mode), deps, log);
}
