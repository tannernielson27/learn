/**
 * The browser SDK, loaded lazily by `reportError.ts` and never imported statically, so it stays
 * its own chunk. Named imports, not `import * as`, so the bundler can drop the parts of the SDK
 * this app does not use (replay, feedback, tracing).
 */
import { captureException, getClient, init } from "@sentry/nextjs";
import { clientSentryOptions } from "./options";

/** Starts the SDK once; later calls find the client already there and do nothing. */
export function startClientSentry(dsn: string, environment: string): void {
  if (getClient()) return;
  init(clientSentryOptions({ dsn, environment }));
}

export { captureException };
