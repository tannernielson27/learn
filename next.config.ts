import type { NextConfig } from "next";
// #289: not from "@sentry/nextjs", whose copy is deprecated (it warns once per build and goes in v11).
import { withSentryConfig } from "@sentry/nextjs/config";
import { sentryBuildEnabled, sentryBuildOptions } from "./src/lib/observability/buildOptions";

const nextConfig: NextConfig = {/* config options here */};

// #235: with no Sentry DSN the config is returned untouched, so local builds, CI and forks are
// exactly what they were. See src/lib/observability/buildOptions.ts and docs/05 §7.9.
export default sentryBuildEnabled(process.env)
  ? withSentryConfig(nextConfig, sentryBuildOptions(process.env))
  : nextConfig;
