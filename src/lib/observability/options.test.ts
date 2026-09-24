import { describe, expect, it } from "vitest";
import {
  TRACES_SAMPLE_RATE,
  clientSentryOptions,
  sentryDsn,
  sentryEnvironment,
  serverSentryOptions,
} from "./options";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

const DSN = "https://public@o0.ingest.sentry.io/0";

describe("sentryDsn", () => {
  it("is off when the variable is missing, empty or blank", () => {
    expect(sentryDsn(undefined)).toBeUndefined();
    expect(sentryDsn("")).toBeUndefined();
    expect(sentryDsn("   ")).toBeUndefined();
  });

  it("is the trimmed value when set", () => {
    expect(sentryDsn(` ${DSN}\n`)).toBe(DSN);
  });
});

describe("sentryEnvironment", () => {
  it("names the Vercel deployment kind, and development anywhere else", () => {
    expect(sentryEnvironment("production")).toBe("production");
    expect(sentryEnvironment("preview")).toBe("preview");
    expect(sentryEnvironment(undefined)).toBe("development");
    expect(sentryEnvironment("")).toBe("development");
  });
});

describe("serverSentryOptions", () => {
  const options = serverSentryOptions({ dsn: DSN, environment: "preview" });

  it("sends no default PII and no local variables", () => {
    expect(options.sendDefaultPii).toBe(false);
    expect(options.includeLocalVariables).toBe(false);
  });

  it("samples at most a tenth of requests for tracing", () => {
    expect(TRACES_SAMPLE_RATE).toBe(0.1);
    expect(options.tracesSampleRate).toBe(TRACES_SAMPLE_RATE);
  });

  it("scrubs every event, transaction and breadcrumb", () => {
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendTransaction).toBe(scrubEvent);
    expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });

  it("carries the DSN and the environment", () => {
    expect(options.dsn).toBe(DSN);
    expect(options.environment).toBe("preview");
  });
});

describe("clientSentryOptions", () => {
  const options = clientSentryOptions({ dsn: DSN, environment: "production" });

  it("sends no default PII, records no session replay and traces nothing", () => {
    expect(options.sendDefaultPii).toBe(false);
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
    expect(options).not.toHaveProperty("tracesSampleRate");
  });

  it("scrubs every event and breadcrumb", () => {
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });

  it("removes browser tracing and replay from the default integrations", () => {
    const defaults = [
      { name: "BrowserTracing" },
      { name: "Replay" },
      { name: "GlobalHandlers" },
      { name: "Breadcrumbs" },
    ];
    expect(options.integrations(defaults).map(({ name }) => name)).toEqual([
      "GlobalHandlers",
      "Breadcrumbs",
    ]);
  });
});
