import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { reportClientError, startClientReporting } from "./reportError";

const DSN = "https://public@o0.ingest.sentry.io/0";

function fakeSentry() {
  const sentry = { startClientSentry: vi.fn(), captureException: vi.fn() };
  return { sentry, load: vi.fn(async () => sentry) };
}

describe("startClientReporting", () => {
  it("loads nothing when no DSN is set", () => {
    const { load } = fakeSentry();
    expect(startClientReporting(undefined, "preview", load)).toBeUndefined();
    expect(startClientReporting("  ", "preview", load)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it("starts the SDK with the DSN and the deployment kind", async () => {
    const { sentry, load } = fakeSentry();
    await startClientReporting(DSN, "preview", load);
    expect(sentry.startClientSentry).toHaveBeenCalledWith(DSN, "preview");
  });

  it("does not throw into the page when the SDK cannot be loaded, as with an ad blocker", async () => {
    const load = vi.fn(async () => {
      throw new Error("ChunkLoadError");
    });
    await expect(startClientReporting(DSN, undefined, load)).resolves.toBeUndefined();
  });
});

describe("reportClientError", () => {
  it("sends nothing and loads nothing when no DSN is set", () => {
    const { load } = fakeSentry();
    expect(reportClientError(new Error("x"), undefined, undefined, load)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it("starts the SDK if needed, then captures the error", async () => {
    const { sentry, load } = fakeSentry();
    const error = new Error("render failed");
    await reportClientError(error, DSN, "production", load);
    expect(sentry.startClientSentry).toHaveBeenCalledWith(DSN, "production");
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("names the environment development when Vercel does not say", async () => {
    const { sentry, load } = fakeSentry();
    await reportClientError(new Error("x"), DSN, undefined, load);
    expect(sentry.startClientSentry).toHaveBeenCalledWith(DSN, "development");
  });

  it("does not throw into the error boundary when reporting fails", async () => {
    const load = vi.fn(async () => {
      throw new Error("ChunkLoadError");
    });
    await expect(reportClientError(new Error("x"), DSN, undefined, load)).resolves.toBeUndefined();
  });
});

describe("the browser bundle", () => {
  it("reaches the Sentry SDK only through a lazy import, so a page's first load does not carry it", () => {
    const source = readFileSync(path.join(import.meta.dirname, "reportError.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["']@sentry\//);
    expect(source).not.toMatch(/from\s+["']\.\/sentryClient["']/);
    expect(source).toMatch(/import\(\s*["']\.\/sentryClient["']\s*\)/);
  });
});
