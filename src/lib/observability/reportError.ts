/**
 * The browser's way to Sentry (#235), used by `src/instrumentation-client.ts` and by every route
 * error boundary.
 *
 * **Off without a DSN.** `NEXT_PUBLIC_SENTRY_DSN` is inlined at build time, so a build without it
 * never loads the SDK and never makes a request.
 *
 * **Lazy with one.** The SDK is loaded with `import()`, so it is its own chunk, fetched after the
 * page is interactive rather than added to every page's first load — the student's phone on a
 * classroom network pays nothing up front. The cost is that an error thrown before the chunk
 * arrives is missed by the global handlers; errors that reach a route boundary are still reported,
 * because reporting one loads the chunk first.
 */
import { sentryDsn, sentryEnvironment } from "./options";

type SentryClient = {
  startClientSentry: (dsn: string, environment: string) => void;
  captureException: (error: unknown) => unknown;
};
type Load = () => Promise<SentryClient>;

const loadSentryClient: Load = () => import("./sentryClient");

/**
 * Reporting must never become a second error. If the chunk is blocked (an ad blocker, a dropped
 * connection) the page carries on exactly as it would with Sentry off; there is nowhere left to
 * report that to, and the student's screen is what matters.
 */
const ignoreReportingFailure = () => undefined;

/** Starts the browser SDK when a DSN is set. Returns undefined, having done nothing, when not. */
export function startClientReporting(
  dsnValue: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN,
  vercelEnv: string | undefined = process.env.NEXT_PUBLIC_VERCEL_ENV,
  load: Load = loadSentryClient,
): Promise<void> | undefined {
  const dsn = sentryDsn(dsnValue);
  if (!dsn) return undefined;
  return load()
    .then((sentry) => sentry.startClientSentry(dsn, sentryEnvironment(vercelEnv)))
    .catch(ignoreReportingFailure);
}

/** Reports an error a route boundary caught. Does nothing, and loads nothing, without a DSN. */
export function reportClientError(
  error: unknown,
  dsnValue: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN,
  vercelEnv: string | undefined = process.env.NEXT_PUBLIC_VERCEL_ENV,
  load: Load = loadSentryClient,
): Promise<void> | undefined {
  const dsn = sentryDsn(dsnValue);
  if (!dsn) return undefined;
  return load()
    .then((sentry) => {
      sentry.startClientSentry(dsn, sentryEnvironment(vercelEnv));
      sentry.captureException(error);
    })
    .catch(ignoreReportingFailure);
}
