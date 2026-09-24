import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  getClient: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sdk);

import { scrubEvent } from "./scrub";
import { startClientSentry } from "./sentryClient";
import { startServerSentry } from "./sentryServer";

const DSN = "https://public@o0.ingest.sentry.io/0";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startServerSentry", () => {
  it("starts the SDK with the scrubbing options", () => {
    startServerSentry(DSN, "production");
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: "production",
        sendDefaultPii: false,
        beforeSend: scrubEvent,
      }),
    );
  });
});

describe("startClientSentry", () => {
  it("starts the SDK with the scrubbing options the first time", () => {
    sdk.getClient.mockReturnValue(undefined);
    startClientSentry(DSN, "preview");
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: "preview",
        sendDefaultPii: false,
        replaysSessionSampleRate: 0,
      }),
    );
  });

  it("does not start a second client", () => {
    sdk.getClient.mockReturnValue({});
    startClientSentry(DSN, "preview");
    expect(sdk.init).not.toHaveBeenCalled();
  });
});
