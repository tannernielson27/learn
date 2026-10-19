/**
 * Tells the operator, through Sentry, that a per-address sign-in ceiling refused a request (#159).
 *
 * A ceiling refusing means one address is being asked for from several networks at once, which is
 * what a lockout campaign looks like. Until #159 that was only a `console.warn`, which helps
 * nobody who is not already reading the logs; this turns it into an event an alert rule can page
 * on (docs/05-VERSION-CONTROL-AND-DEPLOY.md §7.9, "Alert on a sign-in ceiling").
 *
 * **Address-free by construction.** The only input is which ceiling refused, so there is nothing
 * to leak: no address, local part, domain, IP or user id ever reaches this module. Who is being
 * targeted is exactly what must not leave the app. Every event still passes `scrubEvent` too.
 *
 * **Off without a DSN.** Nothing is scheduled and the SDK is never loaded when `SENTRY_DSN` is
 * unset or blank, as for every other server report (`src/instrumentation.ts`).
 *
 * **Throttled.** At most one event per path per `CEILING_ALERT_WINDOW_MS` per server instance. The
 * counter lives in this instance's memory, so a deployment with several warm instances can send
 * one each per window; that is still bounded, and one event is all an alert rule needs. A
 * sustained attack keeps re-arming the alert once a window and never floods the free tier's quota.
 *
 * **After the response.** The send runs in `after()`, so a refused request answers exactly as fast
 * as it did before and the time taken says nothing about whether a ceiling refused it. `flush`
 * makes sure a serverless instance does not freeze with the event still queued.
 */
import { after } from "next/server";
import { sentryDsn } from "./options";

/** Which ceiling refused: a sign-in or invite link, a password try, or a one-time code try. */
export type CeilingPath = "link" | "password" | "code";

/** Fixed, so every refusal groups into one issue per path and nothing variable can ride along. */
export const CEILING_ALERT_MESSAGE = "A sign-in ceiling refused a request";

/** The limits' own window (five minutes): one event per path per window is enough to page on. */
export const CEILING_ALERT_WINDOW_MS = 5 * 60_000;

/** How long to wait for Sentry to take the event before the instance may be frozen. */
const FLUSH_TIMEOUT_MS = 2_000;

type SentryCalls = {
  captureMessage: (message: string, context: CeilingAlertContext) => unknown;
  flush: (timeout?: number) => Promise<boolean>;
};

export type CeilingAlertContext = {
  level: "warning";
  tags: { "auth.ceiling": CeilingPath };
  fingerprint: string[];
};

/** Exactly what is handed to `captureMessage`, so a test can pin it. */
export function ceilingAlertPayload(path: CeilingPath): [string, CeilingAlertContext] {
  return [
    CEILING_ALERT_MESSAGE,
    { level: "warning", tags: { "auth.ceiling": path }, fingerprint: ["auth.ceiling", path] },
  ];
}

export interface CeilingAlertDeps {
  dsn: () => string | undefined;
  now: () => number;
  load: () => Promise<SentryCalls>;
  /** Runs the send once the response has gone. */
  defer: (task: () => Promise<void>) => void;
}

/** Reporting must never become a second error, nor reach the request that was refused. */
const ignore = () => undefined;

export function createCeilingAlerter(deps: CeilingAlertDeps): (path: CeilingPath) => void {
  const lastSent = new Map<CeilingPath, number>();
  const alert = (path: CeilingPath): void => {
    if (!sentryDsn(deps.dsn())) return;
    const now = deps.now();
    const last = lastSent.get(path);
    if (last !== undefined && now - last < CEILING_ALERT_WINDOW_MS) return;
    lastSent.set(path, now);
    const send = (): Promise<void> =>
      deps
        .load()
        .then((sentry) => {
          sentry.captureMessage(...ceilingAlertPayload(path));
          return sentry.flush(FLUSH_TIMEOUT_MS);
        })
        .then(ignore, ignore);
    deps.defer(send);
  };
  // Never throws, whatever fails: a caller such as `createTryLimiter` calls this inside a `try`
  // whose `catch` means "the store could not answer", and a refusal must not read as that.
  return (path) => {
    try {
      alert(path);
    } catch {
      // Nowhere left to report it; the refused request carries on regardless.
    }
  };
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

/** The app's alerter: reads `SENTRY_DSN` on every call, loads the SDK only when it will send. */
export const alertCeilingRefusal = createCeilingAlerter({
  dsn: () => process.env.SENTRY_DSN,
  now: () => Date.now(),
  load: () => import("@sentry/nextjs"),
  defer: afterTheResponse,
});
