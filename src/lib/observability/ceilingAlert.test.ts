import { describe, expect, it, vi } from "vitest";
import {
  CEILING_ALERT_MESSAGE,
  CEILING_ALERT_WINDOW_MS,
  ceilingAlertPayload,
  createCeilingAlerter,
  type CeilingAlertDeps,
} from "./ceilingAlert";

const DSN = "https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0";

function harness(overrides: Partial<CeilingAlertDeps> = {}) {
  let clock = 1_000_000;
  const captureMessage = vi.fn();
  const flush = vi.fn(async () => true);
  const load = vi.fn(async () => ({ captureMessage, flush }));
  const deferred: (() => Promise<void>)[] = [];
  const alert = createCeilingAlerter({
    dsn: () => DSN,
    now: () => clock,
    load,
    defer: (task) => {
      deferred.push(task);
    },
    ...overrides,
  });
  return {
    alert,
    captureMessage,
    flush,
    load,
    deferred,
    tick: (ms: number) => {
      clock += ms;
    },
    run: async () => {
      for (const task of deferred.splice(0)) await task();
    },
  };
}

describe("ceilingAlertPayload (#159)", () => {
  it("is a fixed warning tagged with the path, and nothing else", () => {
    expect(ceilingAlertPayload("password")).toEqual([
      CEILING_ALERT_MESSAGE,
      {
        level: "warning",
        tags: { "auth.ceiling": "password" },
        fingerprint: ["auth.ceiling", "password"],
      },
    ]);
  });
});

describe("createCeilingAlerter (#159)", () => {
  it("sends one address-free warning to Sentry and flushes it", async () => {
    const h = harness();
    h.alert("link");
    await h.run();
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
    expect(h.captureMessage).toHaveBeenCalledWith(...ceilingAlertPayload("link"));
    expect(h.flush).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and loads nothing, without a DSN", async () => {
    const h = harness({ dsn: () => undefined });
    h.alert("link");
    await h.run();
    expect(h.deferred).toHaveLength(0);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("treats a blank DSN as none", async () => {
    const h = harness({ dsn: () => "   " });
    h.alert("code");
    expect(h.deferred).toHaveLength(0);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("sends at most one event per path per window, so a sustained attack cannot flood Sentry", async () => {
    const h = harness();
    for (let i = 0; i < 50; i += 1) h.alert("link");
    await h.run();
    expect(h.captureMessage).toHaveBeenCalledTimes(1);

    h.tick(CEILING_ALERT_WINDOW_MS - 1);
    h.alert("link");
    await h.run();
    expect(h.captureMessage).toHaveBeenCalledTimes(1);

    h.tick(1);
    h.alert("link");
    await h.run();
    expect(h.captureMessage).toHaveBeenCalledTimes(2);
  });

  it("throttles each path on its own", async () => {
    const h = harness();
    h.alert("link");
    h.alert("password");
    h.alert("code");
    h.alert("password");
    await h.run();
    expect(h.captureMessage.mock.calls).toEqual([
      ceilingAlertPayload("link"),
      ceilingAlertPayload("password"),
      ceilingAlertPayload("code"),
    ]);
  });

  it("never becomes a second error when the SDK cannot load or send", async () => {
    const failingLoad = harness({ load: async () => Promise.reject(new Error("blocked")) });
    failingLoad.alert("link");
    await expect(failingLoad.run()).resolves.toBeUndefined();

    const failingSend = harness();
    failingSend.captureMessage.mockImplementation(() => {
      throw new Error("transport");
    });
    failingSend.alert("link");
    await expect(failingSend.run()).resolves.toBeUndefined();
  });

  it("does not throw to the refusing request when scheduling itself fails", () => {
    const h = harness({
      defer: () => {
        throw new Error("outside a request");
      },
    });
    expect(() => h.alert("link")).not.toThrow();
  });

  it("does not throw when reading the DSN or the clock fails", () => {
    const boom = () => {
      throw new Error("boom");
    };
    expect(() => harness({ dsn: boom }).alert("link")).not.toThrow();
    expect(() => harness({ now: boom }).alert("password")).not.toThrow();
  });
});
