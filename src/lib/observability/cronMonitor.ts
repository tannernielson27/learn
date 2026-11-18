/**
 * Tells Sentry's cron monitoring that a scheduled job ran, and whether it worked (#568).
 *
 * pg_cron calls the app's cron routes (ADR 0007). Until now a run that failed, or never arrived,
 * showed only in the logs: §7.8 found the reminders route answering 503 for days because
 * `CRON_SECRET` was missing in Production. A check-in per run lets a Sentry monitor email the
 * alerts inbox when a run fails **or when one is missed**, which a log line never can.
 *
 * **What counts.** The route's own answer decides (`checkInStatus`):
 * - 2xx is `ok`;
 * - 5xx is `error`: not configured, the rate limiter unavailable, or the run failed;
 * - anything else (401 or 429 for a wrong secret) sends nothing. That request was not pg_cron's
 *   run, and a stranger must not be able to mark one. If pg_cron itself holds the wrong secret,
 *   its runs never check in and the monitor's missed-run alert fires instead.
 *
 * **One check-in per run**, carrying the duration, with the monitor's schedule upserted alongside.
 * The first check-in creates the monitor in Sentry, so the schedule lives here in code and not
 * only in a dashboard.
 *
 * **Off without a DSN.** Nothing is scheduled and the SDK is never loaded when `SENTRY_DSN` is
 * unset or blank, as for every other server report (`src/instrumentation.ts`).
 *
 * **After the response**, through `after()` and flushed, like `ceilingAlert.ts`: the run answers
 * pg_cron exactly as fast as before, and a serverless instance does not freeze with the event still
 * queued.
 */
import { after } from "next/server";
import { sentryDsn } from "./options";

export type CheckInStatus = "ok" | "error";

/** The monitor's schedule, upserted with every check-in. `schedule` is a crontab, in UTC. */
export interface CronSchedule {
  crontab: string;
  /** Minutes late a run may start before Sentry counts it as missed. */
  checkinMargin: number;
  /** Minutes a run may take before Sentry counts it as timed out. */
  maxRuntime: number;
}

export type CheckIn = { monitorSlug: string; status: CheckInStatus; duration: number };

export type MonitorConfig = {
  schedule: { type: "crontab"; value: string };
  checkinMargin: number;
  maxRuntime: number;
  timezone: "Etc/UTC";
};

type SentryCalls = {
  captureCheckIn: (checkIn: CheckIn, config: MonitorConfig) => unknown;
  flush: (timeout?: number) => Promise<boolean>;
};

export interface CronMonitorDeps {
  dsn: () => string | undefined;
  /** Milliseconds, for the run's duration. */
  now: () => number;
  load: () => Promise<SentryCalls>;
  /** Runs the send once the response has gone. */
  defer: (task: () => Promise<void>) => void;
}

/** How long to wait for Sentry to take the check-in before the instance may be frozen. */
const FLUSH_TIMEOUT_MS = 2_000;

/** Which check-in a route's answer stands for; undefined sends none (see the header). */
export function checkInStatus(httpStatus: number): CheckInStatus | undefined {
  if (httpStatus >= 200 && httpStatus < 300) return "ok";
  if (httpStatus >= 500) return "error";
  return undefined;
}

/** Exactly what is handed to `captureCheckIn`, so a test can pin it. */
export function checkInPayload(
  slug: string,
  schedule: CronSchedule,
  status: CheckInStatus,
  durationMs: number,
): [CheckIn, MonitorConfig] {
  return [
    { monitorSlug: slug, status, duration: durationMs / 1000 },
    {
      schedule: { type: "crontab", value: schedule.crontab },
      checkinMargin: schedule.checkinMargin,
      maxRuntime: schedule.maxRuntime,
      timezone: "Etc/UTC",
    },
  ];
}

/** Reporting must never become a second error, nor change what pg_cron is answered. */
const ignore = () => undefined;

type Handler = (request: Request) => Promise<Response>;

export function createCronMonitor(deps: CronMonitorDeps) {
  return function withCronMonitor(slug: string, schedule: CronSchedule, handler: Handler): Handler {
    return async (request) => {
      const started = deps.now();
      let status: CheckInStatus | undefined = "error";
      try {
        const response = await handler(request);
        status = checkInStatus(response.status);
        return response;
      } finally {
        // A throw is reported as `error` and then rethrown, untouched, for Next to answer 500.
        report(slug, schedule, status, deps.now() - started);
      }
    };
  };

  function report(
    slug: string,
    schedule: CronSchedule,
    status: CheckInStatus | undefined,
    durationMs: number,
  ): void {
    try {
      if (!status || !sentryDsn(deps.dsn())) return;
      const send = (): Promise<void> =>
        deps
          .load()
          .then((sentry) => {
            sentry.captureCheckIn(...checkInPayload(slug, schedule, status, durationMs));
            return sentry.flush(FLUSH_TIMEOUT_MS);
          })
          .then(ignore, ignore);
      deps.defer(send);
    } catch {
      // Nowhere left to report it; the run's answer stands.
    }
  }
}

/**
 * `after()` throws outside a request (a script, a unit test); the send then runs straight away,
 * unawaited, which is the best that can be done without a response to wait for.
 */
function afterTheResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** The app's monitor: reads `SENTRY_DSN` on every run, loads the SDK only when it will send. */
export const withCronMonitor = createCronMonitor({
  dsn: () => process.env.SENTRY_DSN,
  now: () => Date.now(),
  load: () => import("@sentry/nextjs"),
  defer: afterTheResponse,
});
