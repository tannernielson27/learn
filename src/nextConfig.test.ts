import { afterEach, describe, expect, it, vi } from "vitest";

// #289: `@sentry/nextjs` v10 still exports `withSentryConfig` from its root, but that copy warns
// once per build with a DSN and goes away in v11. next.config.ts must take it from
// `@sentry/nextjs/config`, which is the same function without the warning.
describe("next.config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("wraps the config with Sentry when a DSN is set, without the deprecation warning", async () => {
    vi.stubEnv("SENTRY_DSN", "https://public@o0.ingest.sentry.io/0");
    // The deprecated copy warns through Sentry's consoleSandbox, which only swaps the spy out for
    // the original console.warn once the SDK's console instrumentation has run in this worker.
    // Nothing here initialises the SDK, so the spy sees the warning (this test failed on it
    // before #289).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();

    const { default: config } = await import("../next.config");

    // Sentry's wrapper always adds a webpack hook; the untouched config has none.
    expect(typeof config.webpack).toBe("function");
    const warnings = warn.mock.calls.map((args) => args.map(String).join(" "));
    expect(warnings.filter((line) => line.includes("withSentryConfig"))).toEqual([]);
  });
});
