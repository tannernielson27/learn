import { describe, expect, it, vi } from "vitest";
import {
  checkInPayload,
  checkInStatus,
  createCronMonitor,
  type CronMonitorDeps,
  type CronSchedule,
} from "./cronMonitor";

const DSN = "https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0";
const SCHEDULE: CronSchedule = { crontab: "*/15 * * * *", checkinMargin: 5, maxRuntime: 2 };
const REQUEST = new Request("https://learn.example/api/cron/job", { method: "POST" });

function harness(overrides: Partial<CronMonitorDeps> = {}) {
  let clock = 1_000_000;
  const captureCheckIn = vi.fn();
  const flush = vi.fn(async () => true);
  const load = vi.fn(async () => ({ captureCheckIn, flush }));
  const deferred: (() => Promise<void>)[] = [];
  const withCronMonitor = createCronMonitor({
    dsn: () => DSN,
    now: () => clock,
    load,
    defer: (task) => {
      deferred.push(task);
    },
    ...overrides,
  });
  const wrap = (status: number, takesMs = 1500) =>
    withCronMonitor("job", SCHEDULE, async () => {
      clock += takesMs;
      return new Response(null, { status });
    });
  return {
    withCronMonitor,
    wrap,
    captureCheckIn,
    flush,
    load,
    deferred,
    run: async () => {
      for (const task of deferred.splice(0)) await task();
    },
  };
}

describe("checkInStatus", () => {
  it.each([
    [200, "ok"],
    [204, "ok"],
    [500, "error"],
    [503, "error"],
    [401, undefined],
    [429, undefined],
    [405, undefined],
  ])("reads %i as %s", (status, expected) => {
    expect(checkInStatus(status)).toBe(expected);
  });
});

describe("checkInPayload", () => {
  it("names the monitor, reports seconds, and upserts the schedule in UTC", () => {
    expect(checkInPayload("job", SCHEDULE, "ok", 1500)).toEqual([
      { monitorSlug: "job", status: "ok", duration: 1.5 },
      {
        schedule: { type: "crontab", value: "*/15 * * * *" },
        checkinMargin: 5,
        maxRuntime: 2,
        timezone: "Etc/UTC",
      },
    ]);
  });
});

describe("withCronMonitor", () => {
  it("answers exactly what the handler answered", async () => {
    const h = harness();
    const response = await h.wrap(503)(REQUEST);
    expect(response.status).toBe(503);
  });

  it("checks in ok after the response, then flushes", async () => {
    const h = harness();
    await h.wrap(200)(REQUEST);
    expect(h.captureCheckIn).not.toHaveBeenCalled();
    await h.run();
    expect(h.captureCheckIn).toHaveBeenCalledWith(...checkInPayload("job", SCHEDULE, "ok", 1500));
    expect(h.flush).toHaveBeenCalledOnce();
  });

  it("checks in error when the route answers 5xx", async () => {
    const h = harness();
    await h.wrap(500)(REQUEST);
    await h.run();
    expect(h.captureCheckIn.mock.calls[0]?.[0]).toMatchObject({ status: "error" });
  });

  it("sends nothing for a wrong secret, so a stranger cannot mark a run", async () => {
    const h = harness();
    await h.wrap(401)(REQUEST);
    await h.wrap(429)(REQUEST);
    expect(h.deferred).toHaveLength(0);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("checks in error when the handler throws, and rethrows the same error", async () => {
    const h = harness();
    const boom = new Error("boom");
    const handler = h.withCronMonitor("job", SCHEDULE, async () => {
      throw boom;
    });
    await expect(handler(REQUEST)).rejects.toBe(boom);
    await h.run();
    expect(h.captureCheckIn.mock.calls[0]?.[0]).toMatchObject({ status: "error" });
  });

  it.each([undefined, "", "   "])(
    "does nothing and loads nothing when the DSN is %j",
    async (dsn) => {
      const h = harness({ dsn: () => dsn });
      const response = await h.wrap(200)(REQUEST);
      expect(response.status).toBe(200);
      expect(h.deferred).toHaveLength(0);
      expect(h.load).not.toHaveBeenCalled();
    },
  );

  it("swallows a failed SDK load", async () => {
    const h = harness({ load: async () => Promise.reject(new Error("blocked")) });
    await h.wrap(200)(REQUEST);
    await expect(h.run()).resolves.toBeUndefined();
  });

  it("keeps the route's answer when scheduling the send throws", async () => {
    const h = harness({
      defer: () => {
        throw new Error("no after");
      },
    });
    const response = await h.wrap(200)(REQUEST);
    expect(response.status).toBe(200);
  });
});
