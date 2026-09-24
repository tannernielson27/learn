/**
 * The server and edge SDK, started from `register` in `src/instrumentation.ts` only when
 * `SENTRY_DSN` is set. `@sentry/nextjs` resolves to its Node or edge build by export condition,
 * so one module serves both runtimes.
 */
import { init } from "@sentry/nextjs";
import { serverSentryOptions } from "./options";

export function startServerSentry(dsn: string, environment: string): void {
  init(serverSentryOptions({ dsn, environment }));
}
