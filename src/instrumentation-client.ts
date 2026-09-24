import { startClientReporting } from "@/lib/observability/reportError";

/**
 * Browser error reporting (#235), following
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`.
 *
 * This file runs on every page before hydration, so it stays tiny: without
 * `NEXT_PUBLIC_SENTRY_DSN` it does nothing, and with one it starts loading the SDK as a separate
 * chunk and returns at once. See `src/lib/observability/reportError.ts` for why it is lazy.
 */
void startClientReporting();
