/**
 * Build-time Sentry settings for `next.config.ts` (#235). Pure and free of path aliases, because
 * the Next config loads it before the app's module resolution exists.
 *
 * Off is the default: with no DSN the config is not wrapped at all, so a local build, CI and a
 * fork's preview build exactly what they built before Sentry was added. With a DSN but without
 * all of the upload credentials, events are still reported and source maps are simply not sent.
 */
import { sentryDsn } from "./options";

type BuildEnv = Partial<Record<string, string>>;

/** Whether `withSentryConfig` should wrap the Next config at all. */
export function sentryBuildEnabled(env: BuildEnv): boolean {
  return Boolean(sentryDsn(env.SENTRY_DSN) ?? sentryDsn(env.NEXT_PUBLIC_SENTRY_DSN));
}

/** Uploading needs all three; any one missing means no upload is attempted. */
function uploadCredentials(env: BuildEnv) {
  const authToken = env.SENTRY_AUTH_TOKEN?.trim();
  const org = env.SENTRY_ORG?.trim();
  const project = env.SENTRY_PROJECT?.trim();
  return authToken && org && project ? { authToken, org, project } : undefined;
}

export function sentryBuildOptions(env: BuildEnv) {
  const upload = uploadCredentials(env);
  return {
    ...(upload ?? {}),
    silent: !env.CI,
    // The build plugin reports its own errors to Sentry by default; nothing about this build
    // needs to leave it except the source maps.
    telemetry: false,
    // Uploaded maps are deleted from the output so they are never served to the public.
    sourcemaps: upload ? { disable: false, deleteSourcemapsAfterUpload: true } : { disable: true },
    release: { create: Boolean(upload) },
    // The route list only names client transactions, and the browser sends none (options.ts).
    routeManifestInjection: false as const,
    // Tracing starts on the server alone, so there is no router transition to hook.
    suppressOnRouterTransitionStartWarning: true,
    // A failed upload costs readable stack traces, not the deploy.
    errorHandler: (error: Error) => {
      console.warn(`[sentry] source map upload failed, continuing the build: ${error.message}`);
    },
  };
}
