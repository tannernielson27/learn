/**
 * The options every Sentry `init` in the app is given (#235). Pure: no Sentry import, so what is
 * sent, and how often, can be pinned by a unit test rather than read off a dashboard.
 */
import { scrubBreadcrumb, scrubEvent } from "./scrub";

/** The issue's ceiling for tracing, on the server only. The free tier's span quota is the limit. */
export const TRACES_SAMPLE_RATE = 0.1;

/**
 * Integrations the browser never runs. Tracing is left off to keep the student's phone light, and
 * session replay records the screen, which is a student's answers and name.
 */
const EXCLUDED_CLIENT_INTEGRATIONS = new Set(["BrowserTracing", "Replay", "ReplayCanvas"]);

/** The DSN, or undefined when unset or blank. Undefined means Sentry is off: nothing is started. */
export function sentryDsn(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Vercel's deployment kind (`VERCEL_ENV`), so production and previews file separately. */
export function sentryEnvironment(vercelEnv: string | undefined): string {
  return vercelEnv ? vercelEnv : "development";
}

type Where = { dsn: string; environment: string };

export function serverSentryOptions({ dsn, environment }: Where) {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    // Local variables in a stack frame are whatever the code was holding, student rows included.
    includeLocalVariables: false,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  } as const;
}

export function clientSentryOptions({ dsn, environment }: Where) {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: <I extends { name: string }>(defaults: I[]): I[] =>
      defaults.filter(({ name }) => !EXCLUDED_CLIENT_INTEGRATIONS.has(name)),
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  } as const;
}
