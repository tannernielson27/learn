/**
 * `POST /api/cron/assignment-reminders` (#212, ADR 0007). pg_cron calls it every 15 minutes through
 * pg_net with `Authorization: Bearer <CRON_SECRET>`.
 *
 * One run: submit every attempt left open at close (#208's submit at close, for students who never
 * came back), then enqueue what is owed and send a batch (`sendDueReminders`). The reply is counts
 * only, never an address or a title, and is never cached.
 *
 * The secret is compared in constant time: both sides are hashed to 32 bytes first, so
 * `timingSafeEqual` always compares equal-length buffers and the length of the real secret does
 * not leak either. Two limits, separate so one cannot starve the other: wrong secrets per caller
 * (guessing), and authorised runs overall (a leaked secret cannot drive the mailer flat out). Both
 * count in the shared store (#234), so they hold across server instances; the secret, not the
 * limit, is still the boundary.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Mailer } from "@/lib/email";
import { clientIp, type RequestHeaders } from "@/lib/auth/signInRateLimit";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import { sendDueReminders, type ReminderLog, type ReminderStore } from "./sendReminders";

/** Anything shorter was not made with `openssl rand`, and is refused rather than trusted. */
export const MIN_SECRET_LENGTH = 32;

export type CronLimit = RateLimit;

/** Both reject when the shared store cannot answer; `handleReminderCron` decides what that means. */
export interface CronLimiter {
  /** Counts one wrong secret from this caller; false once over the limit. */
  takeDenied(caller: string): Promise<boolean>;
  /** Counts one authorised run; false once over the limit. */
  takeRun(): Promise<boolean>;
}

export interface ReminderCronDeps {
  /** CRON_SECRET. */
  secret: string | undefined;
  store: () => ReminderStore;
  mailer: () => Mailer;
  /** The submit at close for every assignment; resolves to how many it submitted. */
  autoSubmit: () => Promise<number>;
  origin: (headers: RequestHeaders) => string;
  limiter: CronLimiter;
  log?: ReminderLog;
  now?: () => Date;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** pg_cron runs four times an hour; a few wrong guesses a caller, a few runs a minute. */
export const CRON_LIMITS = {
  denied: { attempts: 10, windowMs: 5 * 60_000 },
  runs: { attempts: 4, windowMs: 60_000 },
} as const satisfies Record<"denied" | "runs", CronLimit>;

export function createCronLimiter(
  store: RateLimitStore,
  limits: Readonly<Record<"denied" | "runs", CronLimit>> = CRON_LIMITS,
): CronLimiter {
  return {
    takeDenied: (caller) => store.hit("cron_denied", caller, limits.denied),
    takeRun: () => store.hit("cron_runs", "runs", limits.runs),
  };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Whether the request carries `Bearer <secret>`, compared in constant time. */
export function bearerMatches(authorization: string | null, secret: string): boolean {
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
  const presented = digest(match?.[1] ?? "");
  const equal = timingSafeEqual(presented, digest(secret));
  return match !== null && equal;
}

function reply(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

async function runAutoSubmit(deps: ReminderCronDeps, log: ReminderLog): Promise<number> {
  try {
    return await deps.autoSubmit();
  } catch (error) {
    // Reminders still go out; the next run (or the student opening the page) submits these.
    log("[reminders] the submit at close failed", { error: errorName(error) });
    return 0;
  }
}

/** A wrong secret is refused either way; the limit only turns 401 into 429 for a guesser. */
async function refuseWrongSecret(
  request: Request,
  limiter: CronLimiter,
  log: ReminderLog,
): Promise<Response> {
  const caller = clientIp(request.headers) ?? "local";
  try {
    if (!(await limiter.takeDenied(caller))) return reply({ error: "rate_limited" }, 429);
  } catch (error) {
    log("[reminders] the shared rate limiter could not answer", { error: failure(error) });
  }
  return reply({ error: "unauthorized" }, 401);
}

/**
 * An authorised run that cannot be counted does not run (fails closed): the next pg_cron tick is
 * fifteen minutes away, and running uncounted is how a leaked secret would get past an outage.
 */
async function countRun(limiter: CronLimiter, log: ReminderLog): Promise<"allowed" | Response> {
  try {
    return (await limiter.takeRun()) ? "allowed" : reply({ error: "rate_limited" }, 429);
  } catch (error) {
    log("[reminders] the shared rate limiter could not answer", { error: failure(error) });
    return reply({ error: "rate_limit_unavailable" }, 503);
  }
}

function failure(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
}

const consoleLog: ReminderLog = (message, details) => console.error(message, details);

export async function handleReminderCron(
  request: Request,
  deps: ReminderCronDeps,
): Promise<Response> {
  const log = deps.log ?? consoleLog;
  const limiter = deps.limiter;
  const secret = deps.secret?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    log("[reminders] CRON_SECRET is not set, or is too short", { minLength: MIN_SECRET_LENGTH });
    return reply({ error: "not_configured" }, 503);
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return refuseWrongSecret(request, limiter, log);
  }
  const run = await countRun(limiter, log);
  if (run !== "allowed") return run;

  const autoSubmitted = await runAutoSubmit(deps, log);
  try {
    const result = await sendDueReminders(deps.store(), deps.mailer(), {
      origin: deps.origin(request.headers),
      now: (deps.now ?? (() => new Date()))(),
      log,
    });
    const counts = {
      autoSubmitted,
      opened: result.enqueued.opened,
      closingSoon: result.enqueued.closingSoon,
      sent: result.sent,
      retrying: result.retrying,
      failed: result.failed,
      deferred: result.deferred,
    };
    if (result.failed > 0 || result.deferred > 0) log("[reminders] run finished", counts);
    return reply(counts);
  } catch (error) {
    // The store's errors name the function and the Postgres code, never data; the name is enough.
    log("[reminders] the run failed", {
      error: errorName(error),
      detail:
        error instanceof Error ? error.message.slice(0, 120).replace(/\S+@\S+/g, "[address]") : "",
    });
    return reply({ error: "failed" }, 500);
  }
}
