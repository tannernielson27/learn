import { describe, expect, it, vi } from "vitest";
import { sentryBuildEnabled, sentryBuildOptions } from "./buildOptions";

const DSN = "https://public@o0.ingest.sentry.io/0";
const UPLOAD = { SENTRY_AUTH_TOKEN: "sntrys_x", SENTRY_ORG: "learn", SENTRY_PROJECT: "learn-web" };

describe("sentryBuildEnabled", () => {
  it("is off with no DSN, so local runs, CI and forks build the plain config", () => {
    expect(sentryBuildEnabled({})).toBe(false);
    expect(sentryBuildEnabled({ SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: " " })).toBe(false);
    // An auth token alone turns nothing on.
    expect(sentryBuildEnabled(UPLOAD)).toBe(false);
  });

  it("is on when either DSN is set", () => {
    expect(sentryBuildEnabled({ SENTRY_DSN: DSN })).toBe(true);
    expect(sentryBuildEnabled({ NEXT_PUBLIC_SENTRY_DSN: DSN })).toBe(true);
  });
});

describe("sentryBuildOptions", () => {
  it("does not try to upload source maps without a token, an org and a project", () => {
    for (const env of [
      { SENTRY_DSN: DSN },
      { SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: "sntrys_x" },
      { SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: "sntrys_x", SENTRY_ORG: "learn" },
    ]) {
      const options = sentryBuildOptions(env);
      expect(options.sourcemaps.disable).toBe(true);
      expect(options.release.create).toBe(false);
    }
  });

  it("uploads source maps, then deletes them from the build, when all three are set", () => {
    const options = sentryBuildOptions({ SENTRY_DSN: DSN, ...UPLOAD });
    expect(options.sourcemaps).toEqual({ disable: false, deleteSourcemapsAfterUpload: true });
    expect(options.release.create).toBe(true);
    expect(options).toMatchObject({
      authToken: "sntrys_x",
      org: "learn",
      project: "learn-web",
    });
  });

  it("sends Sentry no build telemetry and injects no route list into the browser", () => {
    const options = sentryBuildOptions({ SENTRY_DSN: DSN });
    expect(options.telemetry).toBe(false);
    expect(options.routeManifestInjection).toBe(false);
  });

  it("warns instead of failing the deploy when an upload goes wrong", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const options = sentryBuildOptions({ SENTRY_DSN: DSN, ...UPLOAD });
    expect(() => options.errorHandler(new Error("401 from sentry.io"))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("401 from sentry.io"));
    warn.mockRestore();
  });

  it("stays quiet outside CI", () => {
    expect(sentryBuildOptions({ SENTRY_DSN: DSN }).silent).toBe(true);
    expect(sentryBuildOptions({ SENTRY_DSN: DSN, CI: "1" }).silent).toBe(false);
  });
});
