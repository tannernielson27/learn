import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ startServerSentry: vi.fn() }));
const sdk = vi.hoisted(() => ({ captureRequestError: vi.fn() }));
vi.mock("@/lib/observability/sentryServer", () => server);
vi.mock("@sentry/nextjs", () => sdk);

import { onRequestError, register } from "./instrumentation";

const DSN = "https://public@o0.ingest.sentry.io/0";
const REQUEST = { path: "/learn", method: "GET", headers: {} };
const CONTEXT = {
  routerKind: "App Router",
  routePath: "/learn",
  routeType: "render",
  renderSource: "react-server-components",
  revalidateReason: undefined,
  renderType: "dynamic",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("register", () => {
  it("starts nothing without SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    await register();
    expect(server.startServerSentry).not.toHaveBeenCalled();
  });

  it("starts the server SDK for this deployment when SENTRY_DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    vi.stubEnv("VERCEL_ENV", "preview");
    await register();
    expect(server.startServerSentry).toHaveBeenCalledWith(DSN, "preview");
  });
});

describe("onRequestError", () => {
  it("sends nothing without SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    await onRequestError(new Error("boom"), REQUEST, CONTEXT);
    expect(sdk.captureRequestError).not.toHaveBeenCalled();
  });

  it("hands the error to Sentry when SENTRY_DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    const error = new Error("boom");
    await onRequestError(error, REQUEST, CONTEXT);
    expect(sdk.captureRequestError).toHaveBeenCalledWith(error, REQUEST, CONTEXT);
  });
});
