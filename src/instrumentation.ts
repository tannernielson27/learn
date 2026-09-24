import type { Instrumentation } from "next";
import { sentryDsn, sentryEnvironment } from "@/lib/observability/options";

/**
 * Server-side error reporting (#235), following
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
 *
 * Both exports do nothing without `SENTRY_DSN`, and the SDK is only imported once it is set, so
 * local runs, CI and forks never load it. Every event passes through `src/lib/observability/
 * scrub.ts` before it is sent.
 */

/** Runs once per server instance, in the Node and the edge runtime alike. */
export async function register(): Promise<void> {
  const dsn = sentryDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const { startServerSentry } = await import("@/lib/observability/sentryServer");
  startServerSentry(dsn, sentryEnvironment(process.env.VERCEL_ENV));
}

/** Every error the server catches: Server Components, route handlers, Server Actions, the proxy. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!sentryDsn(process.env.SENTRY_DSN)) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(error, request, context);
};
